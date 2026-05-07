import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { distanceKm } from "@/src/domain/geo";
import { findSeedPoi, type SeedPoi } from "@/src/domain/poi-seed";
import { amapDistanceMatrix, isAmapEnabled } from "@/lib/geo/amap-client";
import { lookupAmapPoi } from "@/lib/geo/amap-poi-adapter";

function resolveAnyPoi(id: string): SeedPoi | null {
  return findSeedPoi(id) ?? lookupAmapPoi(id);
}

export const transitModeSchema = z.enum([
  "walking",
  "driving",
  "transit",
  "cycling",
]);
export type TransitMode = z.infer<typeof transitModeSchema>;

const inputSchema = z.object({
  origin_poi_id: z.string().min(1),
  destination_poi_id: z.string().min(1),
  preferred_mode: transitModeSchema.optional(),
});

const outputSchema = z.object({
  origin_poi_id: z.string(),
  destination_poi_id: z.string(),
  estimated_duration_minutes: z.number().int().positive(),
  mode: transitModeSchema,
  distance_km: z.number().positive(),
  recommendation: z.string(),
});

const SPEED_BY_MODE: Record<TransitMode, number> = {
  walking: 4.5,
  cycling: 12,
  driving: 28,
  transit: 18,
};

export function pickModeForDistance(km: number): TransitMode {
  if (km <= 1.2) return "walking";
  if (km <= 3) return "cycling";
  if (km <= 6) return "transit";
  return "driving";
}

export function estimateMinutes(km: number, mode: TransitMode): number {
  return Math.max(4, Math.round((km / SPEED_BY_MODE[mode]) * 60));
}

export const calculateTransitMatrixTool = createTool({
  id: "calculate_transit_matrix",
  description:
    "估算两个 POI 之间的距离 / 通勤时长。优先用 seed 经纬度算 Haversine；如果 POI 不在 seed 里，会退化成名字长度估算。可选 preferred_mode 指定步行/骑行/打车/公交。",
  inputSchema,
  outputSchema,
  execute: async ({ origin_poi_id, destination_poi_id, preferred_mode }) => {
    const o = resolveAnyPoi(origin_poi_id);
    const d = resolveAnyPoi(destination_poi_id);
    let km: number;
    let amapMinutes: number | null = null;
    if (o && d) {
      km = distanceKm({ lat: o.lat, lng: o.lng }, { lat: d.lat, lng: d.lng });
      if (isAmapEnabled()) {
        const amapType = preferred_mode === "walking" ? 3 : 1;
        const legs = await amapDistanceMatrix({
          origin: { lat: o.lat, lng: o.lng },
          destinations: [{ lat: d.lat, lng: d.lng }],
          type: amapType,
        });
        if (legs && legs[0]) {
          km = Number((legs[0].distance_m / 1000).toFixed(2));
          amapMinutes = Math.max(
            1,
            Math.round(legs[0].duration_s / 60),
          );
        }
      }
    } else {
      km = Number(
        (
          (origin_poi_id.length + destination_poi_id.length) * 0.45 +
          1.2
        ).toFixed(1),
      );
    }
    const mode = preferred_mode ?? pickModeForDistance(km);
    const minutes = amapMinutes ?? estimateMinutes(km, mode);
    const sourceTag = amapMinutes !== null ? " · 高德实时" : "";
    const recommendation = (() => {
      if (km <= 1) return `约 ${km}km，建议步行（${minutes}min${sourceTag}）`;
      if (km <= 3)
        return `约 ${km}km，可骑行/步行（${minutes}min · ${mode}${sourceTag}）`;
      if (km <= 6)
        return `约 ${km}km，公交或打车均可（${minutes}min · ${mode}${sourceTag}）`;
      return `约 ${km}km，建议打车（${minutes}min · ${mode}${sourceTag}）`;
    })();

    return {
      origin_poi_id,
      destination_poi_id,
      estimated_duration_minutes: minutes,
      mode,
      distance_km: km,
      recommendation,
    };
  },
});
