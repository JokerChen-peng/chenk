import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { isoDateTimeFromLlm } from "@/src/mastra/tools/nlu/coerce-iso-datetime";
import { distanceKm } from "@/src/domain/geo";
import { findSeedPoi, resolveHomeAnchor } from "@/src/domain/poi-seed";

const inputSchema = z.object({
  origin_poi_id: z.string().min(1).optional(),
  origin_home: z
    .object({
      home_adcode: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
      home_poi_id: z.string().min(1).optional(),
    })
    .optional(),
  destination_poi_id: z.string().min(1),
  pickup_at_iso: isoDateTimeFromLlm,
  party_size: z.number().int().min(1).max(7),
  vehicle_class: z.enum(["economy", "premium", "minivan"]).optional(),
});

const outputSchema = z.object({
  origin_label: z.string(),
  destination_label: z.string(),
  pickup_at_iso: z.string(),
  party_size: z.number().int(),
  vehicle_class: z.enum(["economy", "premium", "minivan"]),
  distance_km: z.number().nonnegative(),
  estimated_duration_minutes: z.number().int().nonnegative(),
  fare_estimate_cny: z.number().nonnegative(),
  driver_eta_minutes: z.number().int().nonnegative(),
  surge_multiplier: z.number().nonnegative(),
  recommendation: z.string(),
});

const BASE_FARE_BY_CLASS: Record<"economy" | "premium" | "minivan", number> = {
  economy: 14,
  premium: 22,
  minivan: 28,
};
const PER_KM_BY_CLASS: Record<"economy" | "premium" | "minivan", number> = {
  economy: 2.6,
  premium: 4.2,
  minivan: 5.0,
};

export const bookTaxiTool = createTool({
  id: "book_taxi",
  description:
    "Mock 网约车询价：给出 ETA、车费、是否高峰加价。本工具只查询；真正下单仍走 execute_transaction(action_type=taxi_pickup)。",
  inputSchema,
  outputSchema,
  execute: async (input) => {
    if (!input.origin_poi_id && !input.origin_home) {
      throw new Error("origin_poi_id 与 origin_home 必须二选一");
    }
    const dest = findSeedPoi(input.destination_poi_id);
    if (!dest) {
      throw new Error(
        JSON.stringify({
          code: "NOT_FOUND",
          message: `Unknown destination_poi_id: ${input.destination_poi_id}`,
        }),
      );
    }
    let originLat: number;
    let originLng: number;
    let originLabel: string;
    if (input.origin_poi_id) {
      const o = findSeedPoi(input.origin_poi_id);
      if (!o) throw new Error(`Unknown origin_poi_id: ${input.origin_poi_id}`);
      originLat = o.lat;
      originLng = o.lng;
      originLabel = o.name;
    } else {
      const home = resolveHomeAnchor(input.origin_home!);
      originLat = home.lat;
      originLng = home.lng;
      originLabel = `家（${home.label}）`;
    }
    const km = distanceKm(
      { lat: originLat, lng: originLng },
      { lat: dest.lat, lng: dest.lng },
    );
    const vehicleClass: "economy" | "premium" | "minivan" =
      input.vehicle_class ?? "economy";
    const pickupIso = String(input.pickup_at_iso);
    const minutes = Math.max(5, Math.round((km / 28) * 60));
    const pickupHour = new Date(pickupIso).getUTCHours();
    const surge =
      pickupHour >= 9 && pickupHour <= 12 ? 1.2 : pickupHour >= 17 && pickupHour <= 21 ? 1.4 : 1.0;
    const baseFare =
      BASE_FARE_BY_CLASS[vehicleClass] + PER_KM_BY_CLASS[vehicleClass] * km;
    const fare = Math.round(baseFare * surge);
    const driver_eta = Math.max(2, Math.min(15, Math.round((km % 7) + 3)));
    return {
      origin_label: originLabel,
      destination_label: dest.name,
      pickup_at_iso: pickupIso,
      party_size: input.party_size,
      vehicle_class: vehicleClass,
      distance_km: Number(km.toFixed(2)),
      estimated_duration_minutes: minutes,
      fare_estimate_cny: fare,
      driver_eta_minutes: driver_eta,
      surge_multiplier: surge,
      recommendation:
        surge > 1.0
          ? `当前为高峰（×${surge}），可考虑改公交（公交约 ${Math.round(minutes * 1.4)}min）`
          : `${minutes}min 到达，建议立即叫车`,
    };
  },
});
