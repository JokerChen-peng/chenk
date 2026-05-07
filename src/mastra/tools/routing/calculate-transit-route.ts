import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  estimateMinutes,
  pickModeForDistance,
  transitModeSchema,
} from "@/src/mastra/tools/routing/calculate-transit-matrix";
import { distanceKm } from "@/src/domain/geo";
import { findSeedPoi, resolveHomeAnchor } from "@/src/domain/poi-seed";
import { amapDistanceMatrix, isAmapEnabled } from "@/lib/geo/amap-client";
import { lookupAmapPoi } from "@/lib/geo/amap-poi-adapter";

const inputSchema = z.object({
  ordered_poi_ids: z.array(z.string().min(1)).min(2).max(10),
  origin: z
    .object({
      home_adcode: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
      home_poi_id: z.string().min(1).optional(),
    })
    .optional()
    .describe("可选：从 home 出发把第一段加上"),
  return_to_origin: z.boolean().default(false),
  preferred_mode: transitModeSchema.optional(),
});

const legSchema = z.object({
  index: z.number().int(),
  origin: z.object({ poi_id: z.string(), label: z.string().optional() }),
  destination: z.object({ poi_id: z.string(), label: z.string().optional() }),
  distance_km: z.number().nonnegative(),
  mode: transitModeSchema,
  estimated_duration_minutes: z.number().int().nonnegative(),
});

const outputSchema = z.object({
  total_distance_km: z.number().nonnegative(),
  total_duration_minutes: z.number().int().nonnegative(),
  legs: z.array(legSchema),
  warnings: z.array(z.string()),
});

type AnchorPoint = { poi_id: string; lat: number; lng: number; label?: string };

function resolvePoint(poi_id: string): AnchorPoint | null {
  const p = findSeedPoi(poi_id) ?? lookupAmapPoi(poi_id);
  if (!p) return null;
  return { poi_id: p.poi_id, lat: p.lat, lng: p.lng, label: p.name };
}

export const calculateTransitRouteTool = createTool({
  id: "calculate_transit_route",
  description:
    "把多个 POI 按给定顺序串成一条「家 → P1 → P2 → ... → 家」的连贯动线，输出每段距离/时长/推荐通勤方式与总和。POI 不在 seed 里的会进 warnings 但不打断计算。",
  inputSchema,
  outputSchema,
  execute: async (input) => {
    const points: AnchorPoint[] = [];
    const warnings: string[] = [];

    if (input.origin) {
      const home = resolveHomeAnchor(input.origin);
      points.push({
        poi_id: "__home__",
        lat: home.lat,
        lng: home.lng,
        label: `家（${home.label}）`,
      });
    }

    for (const pid of input.ordered_poi_ids) {
      const p = resolvePoint(pid);
      if (!p) {
        warnings.push(`未在 seed 中找到 POI: ${pid}`);
        continue;
      }
      points.push(p);
    }

    if (input.return_to_origin && input.origin && points.length >= 2) {
      const home = points[0]!;
      points.push({ ...home, poi_id: "__home_return__", label: `回家（${home.label}）` });
    }

    if (points.length < 2) {
      throw new Error("至少需要两个可解析的途经点才能计算路线");
    }

    const legs = [] as z.infer<typeof legSchema>[];

    // Amap 一次直接拿 origin → 多目的地的距离矩阵；失败/未启用则逐段 Haversine
    let amapLegs: { distance_m: number; duration_s: number }[] | null = null;
    if (isAmapEnabled() && points.length >= 2) {
      const origin = points[0]!;
      const dests = points.slice(1).map((p) => ({ lat: p.lat, lng: p.lng }));
      amapLegs = await amapDistanceMatrix({
        origin: { lat: origin.lat, lng: origin.lng },
        destinations: dests,
        type: input.preferred_mode === "walking" ? 3 : 1,
      });
    }

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      let km = distanceKm(
        { lat: a.lat, lng: a.lng },
        { lat: b.lat, lng: b.lng },
      );
      let durationMin: number | null = null;
      // Amap distance API 返回的是 origin → 各目的地，所以仅当 i === 0 才能用它的精确数据；
      // 其它段仍退到 Haversine + 速度估算（避免 N×M 调用）
      if (amapLegs && i === 0) {
        const leg = amapLegs[0];
        if (leg) {
          km = Number((leg.distance_m / 1000).toFixed(2));
          durationMin = Math.max(1, Math.round(leg.duration_s / 60));
        }
      }
      const mode = input.preferred_mode ?? pickModeForDistance(km);
      legs.push({
        index: i,
        origin: { poi_id: a.poi_id, label: a.label },
        destination: { poi_id: b.poi_id, label: b.label },
        distance_km: Number(km.toFixed(2)),
        mode,
        estimated_duration_minutes: durationMin ?? estimateMinutes(km, mode),
      });
    }
    if (amapLegs) warnings.push("第一段距离/时长来自高德实时数据；其余段为直线估算");
    const total_distance_km = Number(
      legs.reduce((a, l) => a + l.distance_km, 0).toFixed(2),
    );
    const total_duration_minutes = legs.reduce(
      (a, l) => a + l.estimated_duration_minutes,
      0,
    );
    return { total_distance_km, total_duration_minutes, legs, warnings };
  },
});
