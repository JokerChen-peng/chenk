import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  dietaryFilterSchema,
  poiCategorySchema,
  poiSubcategorySchema,
  poiTagSchema,
  sceneSchema,
} from "@/src/domain/taxonomy";
import {
  SEED_POIS,
  resolveHomeAnchor,
  type SeedPoi,
} from "@/src/domain/poi-seed";
import { distanceKm } from "@/src/domain/geo";
import { makeCostBreakdown } from "@/src/domain/pricing";
import {
  deriveParticipantSignal,
  deterministicWaitMinutes,
  scoreCandidate,
  type ParticipantSignal,
} from "@/src/domain/scoring";
import {
  amapFetchVirtualSeedsByCategories,
  isAmapPoiId,
} from "@/lib/geo/amap-poi-adapter";
import { isAmapEnabled } from "@/lib/geo/amap-client";

const searchEnhancedPoiInputSchema = z.object({
  adcode_boundary: z
    .string()
    .regex(/^\d{6}$/, "adcode_boundary must be a 6-digit adcode"),
  category_matrix: z.array(poiCategorySchema).min(1),
  budget_constraint: z
    .number()
    .nonnegative()
    .describe("人均预算红线（CNY）；候选 avg_per_person_cny 应 ≤ 该值的 1.5 倍仍可保留但会降权"),
  /** 软偏好：与 POI tags 相交的越多排越前；不强制过滤 */
  dietary_filters: z.array(dietaryFilterSchema).optional(),
  /** 子类硬过滤：传入则只保留 subcategory ∈ 该列表的 POI，便于「只要博物馆」「只要 citywalk 小吃街」 */
  subcategory_filters: z.array(poiSubcategorySchema).optional(),
  party_size: z.number().int().min(1).max(20).optional(),
  scene: sceneSchema.optional(),
  max_travel_km_from_home: z
    .number()
    .positive()
    .max(60)
    .optional()
    .describe("距 home 的最大公里数；超出会被过滤掉；默认 15km"),
  home_poi_id: z
    .string()
    .min(1)
    .optional()
    .describe("可选：把某个 POI 当作 home（更精确的距离）"),
  /** Mock 雨天偏好：true 时强烈偏向 indoor 标签 */
  prefer_indoor: z.boolean().optional(),
  /**
   * 群体构成（来自 parse_outing_constraints.participants）。
   * 传入后会真正影响排序：孩子在场过滤夜生活、减肥者强加 low_cal、4 人组加 group_friendly。
   * 不传时退化到老规则（向下兼容）。
   */
  participants: z
    .array(
      z.object({
        role: z.string(),
        gender: z.string(),
        age: z.number().int().nonnegative().optional(),
        preferences: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

const searchEnhancedPoiOutputSchema = z.array(
  z.object({
    poi_id: z.string(),
    name: z.string(),
    category: poiCategorySchema,
    subcategory: poiSubcategorySchema,
    adcode: z.string(),
    district: z.string(),
    estimated_cost: z.number(),
    avg_per_person_cny: z.number(),
    current_wait_time_minutes: z.number().int().nonnegative(),
    rating: z.number().min(0).max(5),
    distance_from_home_km: z.number().nonnegative(),
    tags: z.array(poiTagSchema),
    reservation_supported: z.boolean(),
    match_score: z
      .number()
      .min(0)
      .max(100)
      .describe("0–100 综合匹配分（距离/预算/偏好/评分）"),
    match_reasons: z.array(z.string()),
  }),
);

type SearchInputRaw = z.infer<typeof searchEnhancedPoiInputSchema>;
type SearchInput = Required<
  Omit<SearchInputRaw, "home_poi_id" | "participants">
> & {
  home_poi_id?: string;
  participants?: ParticipantSignal;
};

export const searchEnhancedPoiTool = createTool({
  id: "search_enhanced_poi",
  description:
    "搜索本地 POI（Mock seed）。支持按 adcode + 类目矩阵 + 子类 + 饮食/场景偏好 + 离家距离 + 室内偏好综合排序，返回带 distance / tags / match_score / match_reasons 的候选。",
  inputSchema: searchEnhancedPoiInputSchema,
  outputSchema: searchEnhancedPoiOutputSchema,
  execute: async (raw) => {
    const ctx: SearchInput = {
      adcode_boundary: raw.adcode_boundary,
      category_matrix: raw.category_matrix,
      budget_constraint: raw.budget_constraint,
      dietary_filters: raw.dietary_filters ?? [],
      subcategory_filters: raw.subcategory_filters ?? [],
      party_size: raw.party_size ?? 2,
      scene: raw.scene ?? "unknown",
      max_travel_km_from_home: raw.max_travel_km_from_home ?? 15,
      prefer_indoor: raw.prefer_indoor ?? false,
      limit: raw.limit ?? 8,
      home_poi_id: raw.home_poi_id,
      participants:
        raw.participants && raw.participants.length > 0
          ? deriveParticipantSignal({
              party_size: raw.party_size ?? 2,
              participants: raw.participants,
            })
          : undefined,
    };
    const home = resolveHomeAnchor({
      home_poi_id: ctx.home_poi_id,
      home_adcode: ctx.adcode_boundary,
    });

    let pool: SeedPoi[] = SEED_POIS;
    let amap_used = false;
    if (isAmapEnabled()) {
      const amapPool = await amapFetchVirtualSeedsByCategories({
        categories: ctx.category_matrix,
        adcode: ctx.adcode_boundary,
        page_size_per_category: 6,
      });
      if (amapPool && amapPool.length > 0) {
        amap_used = true;
        // 把真实 POI 放在前面，seed 放在后面兜底（去重以名字为准）
        const seenNames = new Set(amapPool.map((p) => p.name));
        pool = [...amapPool, ...SEED_POIS.filter((p) => !seenNames.has(p.name))];
      }
    }

    const candidates = pool.filter((p) => {
      if (
        ctx.subcategory_filters.length > 0 &&
        !ctx.subcategory_filters.includes(p.subcategory)
      ) {
        return false;
      }
      if (
        !ctx.category_matrix.includes(p.category) &&
        !(ctx.scene === "friends" && p.category === "夜生活")
      ) {
        return false;
      }
      return true;
    });

    const scored = candidates.map((p) => {
      const dist = distanceKm({ lat: p.lat, lng: p.lng }, home);
      const { score, reasons } = scoreCandidate(p, ctx, dist);
      const finalReasons = isAmapPoiId(p.poi_id)
        ? ["（高德实时数据）", ...reasons]
        : reasons;
      return {
        p,
        distance_from_home_km: dist,
        score,
        reasons: finalReasons,
      };
    });
    void amap_used;

    const filtered = scored.filter(
      (s) => s.distance_from_home_km <= ctx.max_travel_km_from_home,
    );

    filtered.sort((a, b) => b.score - a.score);

    type ScoredPoi = (typeof filtered)[number];
    let top = filtered.slice(0, ctx.limit);

    if ((ctx.scene === "family" || ctx.scene === "friends") && top.length > 0) {
      const hasNonRestaurant = top.some((s) => s.p.category !== "餐饮");
      if (!hasNonRestaurant) {
        const firstNonRestaurant = filtered.find(
          (s) => s.p.category !== "餐饮",
        );
        const firstRestaurant = filtered.find((s) => s.p.category === "餐饮");
        const diversified: ScoredPoi[] = [
          firstNonRestaurant,
          firstRestaurant,
          ...top,
        ].filter((item): item is ScoredPoi => Boolean(item));

        const seen = new Set<string>();
        top = diversified.filter((item) => {
          if (seen.has(item.p.poi_id)) return false;
          seen.add(item.p.poi_id);
          return true;
        }).slice(0, ctx.limit);
      }
    }

    return top.map((s) => {
      const cost = makeCostBreakdown({
        avg_per_person_cny: s.p.avg_per_person_cny,
        party_size: ctx.party_size,
      });
      return {
        poi_id: s.p.poi_id,
        name: s.p.name,
        category: s.p.category,
        subcategory: s.p.subcategory,
        adcode: s.p.adcode,
        district: s.p.district,
        estimated_cost: cost.total_for_party_cny,
        avg_per_person_cny: cost.avg_per_person_cny,
        current_wait_time_minutes: deterministicWaitMinutes(s.p, ctx.party_size),
        rating: s.p.rating,
        distance_from_home_km: s.distance_from_home_km,
        tags: s.p.tags,
        reservation_supported: s.p.reservation_supported,
        match_score: s.score,
        match_reasons: s.reasons,
      };
    });
  },
});
