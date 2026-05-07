import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { distanceKm } from "@/src/domain/geo";
import { findSeedPoi, resolveHomeAnchor } from "@/src/domain/poi-seed";

const inputSchema = z.object({
  home_adcode: z
    .string()
    .regex(/^\d{6}$/)
    .optional()
    .describe("家所在 6 位 adcode，与 home_poi_id 至少给一个"),
  home_poi_id: z.string().min(1).optional(),
  candidate_poi_ids: z.array(z.string().min(1)).min(1).max(20),
  max_travel_km: z.number().positive().max(60),
});

const outputSchema = z.object({
  home_label: z.string(),
  max_travel_km: z.number(),
  feasible: z.boolean(),
  results: z.array(
    z.object({
      poi_id: z.string(),
      poi_name: z.string().optional(),
      distance_km: z.number().nonnegative(),
      within_envelope: z.boolean(),
    }),
  ),
  violations: z.array(
    z.object({ poi_id: z.string(), distance_km: z.number(), excess_km: z.number() }),
  ),
});

export const validateGeoEnvelopeTool = createTool({
  id: "validate_geo_envelope",
  description:
    "强校验候选 POI 是否落在「离家最大公里数」内。建议在 search 之后、build_structured_itinerary 之前调用一次，违例则替换 POI 或放宽上限。",
  inputSchema,
  outputSchema,
  execute: async (input) => {
    if (!input.home_adcode && !input.home_poi_id) {
      throw new Error("home_adcode 与 home_poi_id 必须至少提供一个");
    }
    const home = resolveHomeAnchor({
      home_adcode: input.home_adcode,
      home_poi_id: input.home_poi_id,
    });
    const results = input.candidate_poi_ids.map((pid) => {
      const seed = findSeedPoi(pid);
      if (!seed) {
        return {
          poi_id: pid,
          poi_name: undefined,
          distance_km: Number.POSITIVE_INFINITY,
          within_envelope: false,
        };
      }
      const d = distanceKm({ lat: seed.lat, lng: seed.lng }, home);
      return {
        poi_id: pid,
        poi_name: seed.name,
        distance_km: d,
        within_envelope: d <= input.max_travel_km,
      };
    });
    const violations = results
      .filter((r) => !r.within_envelope)
      .map((r) => ({
        poi_id: r.poi_id,
        distance_km: Number.isFinite(r.distance_km) ? r.distance_km : -1,
        excess_km: Number.isFinite(r.distance_km)
          ? Number((r.distance_km - input.max_travel_km).toFixed(2))
          : -1,
      }));
    return {
      home_label: home.label,
      max_travel_km: input.max_travel_km,
      feasible: violations.length === 0,
      results: results.map((r) => ({
        poi_id: r.poi_id,
        poi_name: r.poi_name,
        distance_km: Number.isFinite(r.distance_km)
          ? Number(r.distance_km.toFixed(2))
          : 9999,
        within_envelope: r.within_envelope,
      })),
      violations,
    };
  },
});
