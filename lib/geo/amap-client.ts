/**
 * Amap (高德地图) Web API 适配层。
 *
 * 设计原则：
 * - 只在服务端使用（key 通过 process.env.AMAP_KEY 读取，不暴露给浏览器）。
 * - 所有真实工具的 schema 不变；adapter 只负责"有 key 就调真，无 key/失败/超时就返回 null"。
 * - 调用方拿到 null 直接 fallback 到 seed 数据，保证 demo 可离线、vitest 可跑、CLI 不依赖网络。
 * - 内置进程级 LRU + TTL 缓存，避免单次规划反复打同一个 endpoint 触发限流。
 *
 * 真实接口文档：https://lbs.amap.com/api/webservice/summary
 */

const AMAP_BASE = "https://restapi.amap.com";

/** Amap 调用是否启用：MOCK_AGENT=1 一律不调；否则要求 AMAP_KEY 非空。 */
export function isAmapEnabled(): boolean {
  if (process.env.MOCK_AGENT === "1") return false;
  const k = process.env.AMAP_KEY;
  return typeof k === "string" && k.trim().length > 0;
}

function amapKey(): string {
  return (process.env.AMAP_KEY ?? "").trim();
}

function amapTimeoutMs(): number {
  const raw = process.env.AMAP_TIMEOUT_MS;
  if (!raw) return 4000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 4000;
}

/** -------- 简易 LRU + TTL 缓存（进程级，热刷期间共享） -------- */

type CacheEntry<T> = { value: T; expiresAt: number };

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_ENTRIES = 256;
const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  // LRU 触摸
  cache.delete(key);
  cache.set(key, e);
  return e.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  if (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** 仅供测试用：清空缓存 */
export function __resetAmapCacheForTests(): void {
  cache.clear();
}

/** -------- HTTP 抓取（带超时、JSON、错误一律降级 null） -------- */

type FetchLike = typeof fetch;

async function amapGet<T>(
  pathAndQuery: string,
  fetchImpl: FetchLike = fetch,
): Promise<T | null> {
  if (!isAmapEnabled()) return null;
  const key = amapKey();
  const url = `${AMAP_BASE}${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}&output=JSON`;

  const cached = cacheGet<T>(url);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), amapTimeoutMs());
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { status?: string } & Record<
      string,
      unknown
    >;
    if (json && json.status === "0") return null; // Amap "失败"
    cacheSet(url, json as unknown as T);
    return json as unknown as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** -------- 公共类型（adapter 输出，已归一化） -------- */

export type AmapPoi = {
  /** Amap pid，用于追溯但不会进入下单链路 */
  external_amap_id: string;
  name: string;
  /** 顶层类别（"餐饮服务"/"购物服务"/...） */
  category_top: string;
  /** Amap 三级类型字符串 */
  category_path: string;
  adcode: string;
  district: string;
  lat: number;
  lng: number;
  /** Amap 没有「人均」概念，给到调用方时为 null，由调用方按种类做估算 */
  avg_per_person_cny: number | null;
  rating: number | null;
  address: string;
};

export type AmapWeather = {
  adcode: string;
  date: string;
  /** 24 条逐小时（无 hourly 数据时为 null，调用方应回退 mock） */
  hourly:
    | {
        hour: number;
        condition:
          | "sunny"
          | "cloudy"
          | "light_rain"
          | "heavy_rain"
          | "thunderstorm"
          | "snow"
          | "haze";
        temperature_c: number;
        precipitation_probability: number;
      }[]
    | null;
  high_temp_c: number;
  low_temp_c: number;
  raw_summary: string;
};

export type AmapDistanceLeg = {
  /** 米 */
  distance_m: number;
  /** 秒 */
  duration_s: number;
};

/** -------- POI 搜索 -------- */

const POI_TOP_TO_CATEGORY: Record<
  string,
  | "餐饮"
  | "亲子"
  | "展览"
  | "户外"
  | "咖啡"
  | "夜生活"
  | undefined
> = {
  "餐饮服务": "餐饮",
  "购物服务": undefined,
  "生活服务": undefined,
  "体育休闲服务": "户外",
  "科教文化服务": "展览",
  "风景名胜": "户外",
  "亲子": "亲子",
};

/** Amap 三级类目字符串 → 我们的 PoiCategory，做最常见的归一 */
export function categorizeAmapPoi(typecode: string, type: string): string {
  // type 形如 "餐饮服务;咖啡厅;咖啡厅" / "科教文化服务;美术馆;美术馆"
  const top = type.split(";")[0]?.trim() ?? "";
  const sub = type.split(";")[1]?.trim() ?? "";
  if (top === "餐饮服务" && /咖啡/.test(sub)) return "咖啡";
  if (top === "餐饮服务" && /酒吧/.test(sub)) return "夜生活";
  if (top === "餐饮服务") return "餐饮";
  if (top === "科教文化服务" && /(博物|美术|展览)/.test(sub)) return "展览";
  if (top === "体育休闲服务") return "户外";
  if (top === "风景名胜") return "户外";
  if (top === "亲子" || /亲子|游乐/.test(sub)) return "亲子";
  return POI_TOP_TO_CATEGORY[top] ?? "餐饮";
}

type AmapPoiV5 = {
  id?: string;
  name?: string;
  type?: string;
  typecode?: string;
  adcode?: string;
  adname?: string;
  location?: string;
  address?: string;
  business?: { rating?: string };
};

function parseLocation(loc: string | undefined): { lat: number; lng: number } | null {
  if (!loc || typeof loc !== "string") return null;
  const [lng, lat] = loc.split(",").map((n) => Number(n));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function amapSearchPoi(
  args: {
    keyword: string;
    adcode?: string;
    page_size?: number;
  },
  fetchImpl?: FetchLike,
): Promise<AmapPoi[] | null> {
  if (!isAmapEnabled()) return null;
  const params = new URLSearchParams();
  params.set("keywords", args.keyword);
  if (args.adcode) params.set("region", args.adcode);
  params.set("page_size", String(Math.min(25, args.page_size ?? 10)));
  params.set("show_fields", "business");
  const json = await amapGet<{
    pois?: AmapPoiV5[];
  }>(`/v5/place/text?${params.toString()}`, fetchImpl);
  if (!json || !Array.isArray(json.pois)) return null;
  const out: AmapPoi[] = [];
  for (const p of json.pois) {
    const loc = parseLocation(p.location);
    if (!loc) continue;
    if (typeof p.id !== "string" || typeof p.name !== "string") continue;
    const ratingStr = p.business?.rating;
    const rating = ratingStr ? Number(ratingStr) : null;
    out.push({
      external_amap_id: p.id,
      name: p.name,
      category_top: (p.type ?? "").split(";")[0] ?? "",
      category_path: p.type ?? "",
      adcode: p.adcode ?? args.adcode ?? "",
      district: p.adname ?? "",
      lat: loc.lat,
      lng: loc.lng,
      avg_per_person_cny: null,
      rating: Number.isFinite(rating) ? (rating as number) : null,
      address: p.address ?? "",
    });
  }
  return out;
}

/** -------- 距离矩阵（驾车，1对多） -------- */

export async function amapDistanceMatrix(
  args: {
    origin: { lat: number; lng: number };
    destinations: { lat: number; lng: number }[];
    /** 0=直线 1=驾车 3=步行 */
    type?: 0 | 1 | 3;
  },
  fetchImpl?: FetchLike,
): Promise<AmapDistanceLeg[] | null> {
  if (!isAmapEnabled()) return null;
  if (args.destinations.length === 0) return [];
  const params = new URLSearchParams();
  params.set("origins", `${args.origin.lng},${args.origin.lat}`);
  params.set(
    "destination",
    args.destinations.map((d) => `${d.lng},${d.lat}`).join("|"),
  );
  params.set("type", String(args.type ?? 1));
  const json = await amapGet<{
    results?: { distance?: string; duration?: string }[];
  }>(`/v3/distance?${params.toString()}`, fetchImpl);
  if (!json || !Array.isArray(json.results)) return null;
  if (json.results.length !== args.destinations.length) return null;
  return json.results.map((r) => ({
    distance_m: Number(r.distance ?? "0"),
    duration_s: Number(r.duration ?? "0"),
  }));
}

/** -------- 逆地理编码（经纬度 → adcode） -------- */

export async function amapReverseGeocode(
  args: { lat: number; lng: number },
  fetchImpl?: FetchLike,
): Promise<{
  adcode: string;
  province: string;
  city: string;
  district: string;
  formatted_address: string;
} | null> {
  if (!isAmapEnabled()) return null;
  const params = new URLSearchParams();
  params.set("location", `${args.lng},${args.lat}`);
  params.set("extensions", "base");
  const json = await amapGet<{
    regeocode?: {
      formatted_address?: string;
      addressComponent?: {
        adcode?: string;
        province?: string;
        city?: string | string[];
        district?: string | string[];
      };
    };
  }>(`/v3/geocode/regeo?${params.toString()}`, fetchImpl);
  const c = json?.regeocode?.addressComponent;
  const adcode = c?.adcode;
  if (!adcode || !/^\d{6}$/.test(adcode)) return null;
  const oneOf = (v: unknown): string =>
    typeof v === "string" ? v : Array.isArray(v) ? String(v[0] ?? "") : "";
  return {
    adcode,
    province: oneOf(c?.province),
    city: oneOf(c?.city),
    district: oneOf(c?.district),
    formatted_address: json?.regeocode?.formatted_address ?? "",
  };
}

/** -------- 天气（实况 + 预报） -------- */

const AMAP_WEATHER_TO_CONDITION: Record<string, AmapWeather["hourly"] extends Array<infer T> | null ? (T extends { condition: infer C } ? C : never) : never> = {} as never;

function mapAmapWeatherText(
  text: string | undefined,
):
  | "sunny"
  | "cloudy"
  | "light_rain"
  | "heavy_rain"
  | "thunderstorm"
  | "snow"
  | "haze" {
  void AMAP_WEATHER_TO_CONDITION;
  if (!text) return "cloudy";
  if (/雷|闪电/.test(text)) return "thunderstorm";
  if (/暴雨|大雨/.test(text)) return "heavy_rain";
  if (/小雨|阵雨|中雨|雨/.test(text)) return "light_rain";
  if (/雪/.test(text)) return "snow";
  if (/霾|沙尘|浮尘|雾/.test(text)) return "haze";
  if (/晴/.test(text)) return "sunny";
  return "cloudy";
}

export async function amapWeather(
  args: { adcode: string; date: string },
  fetchImpl?: FetchLike,
): Promise<AmapWeather | null> {
  if (!isAmapEnabled()) return null;

  const params = new URLSearchParams();
  params.set("city", args.adcode);
  params.set("extensions", "all"); // forecast (4 天)
  const json = await amapGet<{
    forecasts?: {
      casts?: {
        date?: string;
        dayweather?: string;
        nightweather?: string;
        daytemp?: string;
        nighttemp?: string;
      }[];
    }[];
  }>(`/v3/weather/weatherInfo?${params.toString()}`, fetchImpl);
  const cast = json?.forecasts?.[0]?.casts?.find((c) => c.date === args.date);
  if (!cast) return null;
  const high = Number(cast.daytemp ?? "0");
  const low = Number(cast.nighttemp ?? "0");
  const dayCond = mapAmapWeatherText(cast.dayweather);
  const nightCond = mapAmapWeatherText(cast.nightweather);

  // Amap 没有逐小时；这里按"白天 6-18 点用 dayweather，其它用 nightweather"伪 hourly
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const isDay = h >= 6 && h < 18;
    const cond = isDay ? dayCond : nightCond;
    const tBase = isDay ? high : low;
    const wave = Math.sin(((h - 14) / 24) * Math.PI * 2);
    const temperature_c = Number((tBase + wave * 1.5).toFixed(1));
    const precipitation_probability =
      cond === "heavy_rain" || cond === "thunderstorm"
        ? 80
        : cond === "light_rain"
          ? 50
          : cond === "snow"
            ? 60
            : cond === "haze"
              ? 10
              : 8;
    return { hour: h, condition: cond, temperature_c, precipitation_probability };
  });

  return {
    adcode: args.adcode,
    date: args.date,
    hourly,
    high_temp_c: high,
    low_temp_c: low,
    raw_summary: `白天${cast.dayweather ?? ""}/夜间${cast.nightweather ?? ""}，${low}–${high}℃`,
  };
}
