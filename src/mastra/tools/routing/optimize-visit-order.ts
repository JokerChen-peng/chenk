import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { distanceKm } from "@/src/domain/geo";
import { findSeedPoi, resolveHomeAnchor } from "@/src/domain/poi-seed";

const inputSchema = z.object({
  candidate_poi_ids: z.array(z.string().min(1)).min(2).max(8),
  home_adcode: z.string().regex(/^\d{6}$/).optional(),
  home_poi_id: z.string().min(1).optional(),
  must_be_first_poi_id: z.string().min(1).optional(),
  must_be_last_poi_id: z.string().min(1).optional(),
});

const outputSchema = z.object({
  ordered_poi_ids: z.array(z.string()),
  total_distance_km: z.number().nonnegative(),
  algorithm: z.literal("nearest_neighbor"),
  steps_explained: z.array(z.string()),
});

export const optimizeVisitOrderTool = createTool({
  id: "optimize_visit_order",
  description:
    "对一组候选 POI 做最近邻排序（nearest neighbor heuristic），从家出发，必要时锁定首/尾节点。输出建议访问顺序与总距离，便于直接喂给 calculate_transit_route。",
  inputSchema,
  outputSchema,
  execute: async (input) => {
    const home = resolveHomeAnchor({
      home_adcode: input.home_adcode,
      home_poi_id: input.home_poi_id,
    });
    const points = input.candidate_poi_ids
      .map((pid) => {
        const p = findSeedPoi(pid);
        if (!p) return null;
        return { poi_id: pid, lat: p.lat, lng: p.lng };
      })
      .filter((x): x is { poi_id: string; lat: number; lng: number } => x != null);

    if (points.length < 2) {
      throw new Error("候选 POI 中至少要有 2 个能在 seed 中解析");
    }

    const remaining = new Map(points.map((p) => [p.poi_id, p]));
    const ordered: string[] = [];
    let cursor = home;
    const explain: string[] = [];

    if (input.must_be_first_poi_id && remaining.has(input.must_be_first_poi_id)) {
      const p = remaining.get(input.must_be_first_poi_id)!;
      ordered.push(p.poi_id);
      remaining.delete(p.poi_id);
      cursor = { lat: p.lat, lng: p.lng, label: p.poi_id };
      explain.push(`锁定首站 ${p.poi_id}`);
    }

    const lastLock =
      input.must_be_last_poi_id && remaining.has(input.must_be_last_poi_id)
        ? remaining.get(input.must_be_last_poi_id)!
        : null;
    if (lastLock) remaining.delete(lastLock.poi_id);

    while (remaining.size > 0) {
      let bestId: string | null = null;
      let bestKm = Number.POSITIVE_INFINITY;
      for (const p of remaining.values()) {
        const d = distanceKm({ lat: cursor.lat, lng: cursor.lng }, { lat: p.lat, lng: p.lng });
        if (d < bestKm) {
          bestKm = d;
          bestId = p.poi_id;
        }
      }
      if (!bestId) break;
      const p = remaining.get(bestId)!;
      ordered.push(p.poi_id);
      cursor = { lat: p.lat, lng: p.lng, label: p.poi_id };
      explain.push(`下一站选 ${p.poi_id}（${bestKm.toFixed(2)}km）`);
      remaining.delete(bestId);
    }

    if (lastLock) {
      ordered.push(lastLock.poi_id);
      explain.push(`锁定末站 ${lastLock.poi_id}`);
    }

    let total = 0;
    let prev = home;
    for (const pid of ordered) {
      const p = findSeedPoi(pid);
      if (!p) continue;
      total += distanceKm({ lat: prev.lat, lng: prev.lng }, { lat: p.lat, lng: p.lng });
      prev = { lat: p.lat, lng: p.lng, label: pid };
    }

    return {
      ordered_poi_ids: ordered,
      total_distance_km: Number(total.toFixed(2)),
      algorithm: "nearest_neighbor" as const,
      steps_explained: explain,
    };
  },
});
