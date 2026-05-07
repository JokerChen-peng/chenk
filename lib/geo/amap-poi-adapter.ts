/**
 * 把 Amap POI 归一化成「类 SeedPoi」，使 search_enhanced_poi 的打分管线可以直接消费。
 *
 * - poi_id 一律加 "amap:" 前缀，避免和美团 mock POI 冲突；
 *   后续 execute_transaction 看到 amap: 前缀会拒绝下单（这些不是美团交易侧 POI）。
 * - subcategory / tags / avg_per_person_cny 从 Amap 的 category_path 和 typecode 启发式推断。
 */

import type { AmapPoi } from "./amap-client";
import { amapSearchPoi } from "./amap-client";
import type { SeedPoi } from "@/src/domain/poi-seed";
import type {
  PoiCategory,
  PoiSubcategory,
  PoiTag,
} from "@/src/domain/taxonomy";
import { inferAvgPerPersonFromText } from "@/src/domain/pricing";

const AMAP_POI_PREFIX = "amap:";

export function isAmapPoiId(poi_id: string): boolean {
  return poi_id.startsWith(AMAP_POI_PREFIX);
}

/**
 * 进程级缓存：search_enhanced_poi 拿到 Amap POI 后会写入这里，
 * 后续 calculate_transit_matrix / calculate_transit_route 拿到 amap: 前缀的 POI 时
 * 可以从这里反查经纬度（避免再次打 Amap）。
 */
const amapPoiRegistry = new Map<string, SeedPoi>();

export function rememberAmapPoi(seed: SeedPoi): void {
  if (!isAmapPoiId(seed.poi_id)) return;
  amapPoiRegistry.set(seed.poi_id, seed);
}

export function lookupAmapPoi(poi_id: string): SeedPoi | null {
  return amapPoiRegistry.get(poi_id) ?? null;
}

export function __resetAmapPoiRegistryForTests(): void {
  amapPoiRegistry.clear();
}

/** 类目 → Amap 关键词建议（用于驱动 `amapSearchPoi` 的 keyword 入参） */
const CATEGORY_KEYWORDS: Record<PoiCategory, string[]> = {
  "餐饮": ["餐厅"],
  "咖啡": ["咖啡"],
  "亲子": ["亲子乐园", "儿童乐园"],
  "展览": ["美术馆", "博物馆"],
  "户外": ["公园"],
  "夜生活": ["酒吧"],
};

export function keywordsForCategory(c: PoiCategory): string[] {
  return CATEGORY_KEYWORDS[c] ?? [c];
}

/** Amap category_path → 我们的 subcategory 枚举（找不到时返回 null）.
 * 用整条 path 而不是单一 segment 匹配，因为 v5 三级类目里关键词常见于 2 或 3 段。 */
function inferSubcategory(p: AmapPoi): PoiSubcategory | null {
  const path = p.category_path;
  const top = p.category_top;

  if (top === "餐饮服务") {
    if (/亲子/.test(path)) return "亲子餐厅";
    if (/沙拉|轻食/.test(path)) return "轻食沙拉";
    if (/火锅/.test(path)) return "火锅";
    if (/咖啡/.test(path)) return "精品咖啡";
    if (/酒吧/.test(path)) return "酒吧";
    if (/甜品|蛋糕|烘焙/.test(path)) return "甜品下午茶";
    if (/日本料理|日料/.test(path)) return "日料";
    if (/西餐|意大利|法国|牛排/.test(path)) return "西餐";
    if (/粤菜|港式/.test(path)) return "粤菜";
    if (/上海|本帮/.test(path)) return "本帮菜";
    return "中餐";
  }
  if (/博物馆/.test(path)) return "博物馆";
  if (/美术馆/.test(path)) return "美术馆";
  if (/动物园|植物园|公园|广场/.test(path)) return "城市公园";
  if (/亲子|游乐|儿童/.test(path)) return "亲子乐园";
  if (/酒吧/.test(path)) return "酒吧";
  return null;
}

/**
 * 严格类目判定：只在能明确识别时返回，识别不出（比如鲜花速递、便利店、
 * 加油站之类被 Amap 关键词模糊命中的非目标 POI）就返回 null，让调用方丢弃。
 * 千万不要 fallback 到 "餐饮"——那会把"野兽派鲜花速递"这种当成餐厅。
 */
function inferCategory(p: AmapPoi): PoiCategory | null {
  const top = p.category_top;
  const path = p.category_path;
  if (top === "餐饮服务" && /咖啡/.test(path)) return "咖啡";
  if (top === "餐饮服务" && /酒吧/.test(path)) return "夜生活";
  if (top === "餐饮服务") return "餐饮";
  if (/博物|美术|展览|科技馆/.test(path)) return "展览";
  if (/亲子|游乐|儿童/.test(path)) return "亲子";
  if (/公园|广场|滨江|植物园|动物园/.test(path)) return "户外";
  if (/酒吧|live\s*house/i.test(path)) return "夜生活";
  return null;
}

const TAG_RULES: Array<{ test: RegExp; tags: PoiTag[] }> = [
  { test: /亲子|儿童|游乐/, tags: ["kid_friendly", "stroller_friendly"] },
  { test: /沙拉|轻食/, tags: ["low_cal", "vegetarian_options"] },
  { test: /素食/, tags: ["vegetarian_options"] },
  { test: /咖啡/, tags: ["low_cal", "indoor", "wifi"] },
  { test: /美术馆|博物馆|展览/, tags: ["indoor", "photogenic"] },
  { test: /公园|滨江|步道|广场/, tags: ["outdoor_seat", "photogenic", "kid_friendly"] },
  { test: /酒吧/, tags: ["indoor", "couple_friendly", "quiet"] },
  { test: /火锅|海底捞/, tags: ["group_friendly", "indoor"] },
];

function inferTags(p: AmapPoi): PoiTag[] {
  const set = new Set<PoiTag>();
  for (const r of TAG_RULES) {
    if (r.test.test(p.category_path) || r.test.test(p.name)) {
      for (const t of r.tags) set.add(t);
    }
  }
  // 室内/室外补足：餐饮和展览默认 indoor，否则不补
  if (p.category_top === "餐饮服务" || /博物馆|美术馆/.test(p.category_path)) {
    set.add("indoor");
  }
  return Array.from(set);
}

function inferAvgPerPerson(p: AmapPoi, cat: PoiCategory): number {
  return inferAvgPerPersonFromText({
    category: cat,
    category_path: p.category_path,
    name: p.name,
  });
}

/** 主类目识别成功但子类没命中时的兜底（保证 POI 不会被误丢） */
const DEFAULT_SUBCATEGORY_BY_CATEGORY: Record<PoiCategory, PoiSubcategory> = {
  "餐饮": "中餐",
  "咖啡": "精品咖啡",
  "亲子": "亲子乐园",
  "展览": "博物馆",
  "户外": "城市公园",
  "夜生活": "酒吧",
};

/**
 * 把单条 Amap POI 归一化成 SeedPoi 形状（只在打分流水线内部消费，
 * **永远不会写回 SEED_POIS，也不会进入 execute_transaction**）。
 *
 * 类目识别不出来时返回 null —— 例如 "野兽派鲜花速递"（购物服务 / 鲜花礼品）
 * 被关键词"餐厅"模糊命中后返回，应被丢弃而不是强行扣到"餐饮"上。
 */
export function amapPoiToVirtualSeed(p: AmapPoi): SeedPoi | null {
  const cat = inferCategory(p);
  if (cat === null) return null;
  const sub = inferSubcategory(p) ?? DEFAULT_SUBCATEGORY_BY_CATEGORY[cat];
  const tags = inferTags(p);
  const avg = inferAvgPerPerson(p, cat);
  const rating = typeof p.rating === "number" && p.rating > 0 ? p.rating : 4.3;
  const reservation_supported = cat === "餐饮" || cat === "亲子" || cat === "展览";

  return {
    poi_id: `${AMAP_POI_PREFIX}${p.external_amap_id}`,
    name: p.name,
    category: cat,
    subcategory: sub,
    adcode: p.adcode,
    district: p.district,
    lat: p.lat,
    lng: p.lng,
    tags,
    avg_per_person_cny: avg,
    rating,
    reservation_supported,
    open_hours: [{ open: "09:00", close: "22:00" }],
  };
}

/** 给定一组类目，分别向 Amap 拉 POI 候选并归一化；任何错误都返回 null（调用方 fallback seed） */
export async function amapFetchVirtualSeedsByCategories(args: {
  categories: PoiCategory[];
  adcode?: string;
  page_size_per_category?: number;
}): Promise<SeedPoi[] | null> {
  const buckets: SeedPoi[] = [];
  let anySuccess = false;
  for (const cat of args.categories) {
    const keywords = keywordsForCategory(cat);
    for (const kw of keywords) {
      const pois = await amapSearchPoi({
        keyword: kw,
        adcode: args.adcode,
        page_size: args.page_size_per_category ?? 8,
      });
      if (pois === null) continue; // 单次失败容忍
      anySuccess = true;
      for (const p of pois) {
        const seed = amapPoiToVirtualSeed(p);
        if (seed === null) continue; // 类目识别不出来（例如关键词搜"餐厅"返回鲜花速递）则丢弃
        rememberAmapPoi(seed);
        buckets.push(seed);
      }
    }
  }
  if (!anySuccess) return null;
  // 按 amap_id 去重
  const seen = new Set<string>();
  const dedup: SeedPoi[] = [];
  for (const s of buckets) {
    if (seen.has(s.poi_id)) continue;
    seen.add(s.poi_id);
    dedup.push(s);
  }
  return dedup;
}
