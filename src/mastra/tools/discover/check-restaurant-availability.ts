import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { isoDateTimeFromLlm } from "@/src/mastra/tools/nlu/coerce-iso-datetime";
import { findSeedPoi } from "@/src/domain/poi-seed";

const inputSchema = z.object({
  poi_id: z.string().min(1),
  party_size: z.number().int().min(1).max(20),
  desired_time_iso: isoDateTimeFromLlm.describe(
    "用户希望就餐的时刻；工具会围绕这个时间找候选时段",
  ),
});

const slotSchema = z.object({
  slot_id: z.string(),
  start_time_iso: z.string(),
  end_time_iso: z.string(),
  available_seats: z.number().int().nonnegative(),
  is_walk_in: z.boolean(),
  notes: z.string().optional(),
});

const outputSchema = z.object({
  poi_id: z.string(),
  poi_name: z.string(),
  reservation_supported: z.boolean(),
  party_size: z.number().int(),
  desired_time_iso: z.string(),
  slots: z.array(slotSchema),
  waitlist: z.object({
    eta_minutes: z.number().int().nonnegative(),
    queue_position: z.number().int().nonnegative(),
    walk_in_eligible: z.boolean(),
  }),
  recommended_slot_id: z.string().optional(),
  open_hours_today: z.object({ open: z.string(), close: z.string() }),
});

function deterministicSeats(poi_id: string, slotIndex: number, party: number): number {
  let h = 0;
  for (const ch of poi_id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const base = Math.abs(h + slotIndex * 11) % 9;
  return Math.max(0, base + 2 - Math.max(0, party - 4));
}

/**
 * Demo / 测试用：通过 env `OUTING_BUSY_POI_IDS=poi-1,poi-2` 把指定 POI 模拟成"今天爆满"，
 * 所有 slot 返回 0 座位且排队 75 分钟，用于演示 agent 自动切备选的能力。
 */
function isPoiForcedBusy(poi_id: string): boolean {
  const raw = process.env.OUTING_BUSY_POI_IDS;
  if (!raw) return false;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(poi_id);
}

export const checkRestaurantAvailabilityTool = createTool({
  id: "check_restaurant_availability",
  description:
    "查询餐厅在 desired_time 附近的可预订时段（slots）与排队预计（waitlist），用于支撑下一步 book_reservation。Mock 数据，但同一 poi_id+time 会得到稳定结果。",
  inputSchema,
  outputSchema,
  execute: async (input) => {
    const p = findSeedPoi(input.poi_id);
    if (!p) {
      throw new Error(
        JSON.stringify({
          code: "NOT_FOUND",
          message: `Unknown poi_id: ${input.poi_id}`,
        }),
      );
    }

    const desired = new Date(String(input.desired_time_iso));
    if (Number.isNaN(desired.getTime())) {
      throw new Error("desired_time_iso must be a parseable datetime");
    }

    const today = p.open_hours[0] ?? { open: "10:00", close: "22:00" };
    const forcedBusy = isPoiForcedBusy(p.poi_id);

    // 围绕 desired_time 生成 4 个候选 slot：-30 / +0 / +30 / +60 分钟（但严格落在营业时间内）.
    const slots: z.infer<typeof slotSchema>[] = [];
    const offsets = [-30, 0, 30, 60];
    for (let i = 0; i < offsets.length; i++) {
      const offsetMin = offsets[i]!;
      const slotStart = new Date(desired.getTime() + offsetMin * 60_000);
      const slotEnd = new Date(slotStart.getTime() + 90 * 60_000);
      const seats = forcedBusy
        ? 0
        : p.reservation_supported
          ? deterministicSeats(p.poi_id, i, input.party_size)
          : 0;
      slots.push({
        slot_id: `${p.poi_id}-slot-${slotStart.toISOString().slice(11, 16)}`,
        start_time_iso: slotStart.toISOString(),
        end_time_iso: slotEnd.toISOString(),
        available_seats: seats,
        is_walk_in: !p.reservation_supported,
        notes:
          seats === 0
            ? forcedBusy
              ? "该时段已订满，建议换备选餐厅"
              : "该时段已无座位，需走 walk-in 排队"
            : seats <= 1
              ? "仅余 1 桌，建议尽快确认"
              : undefined,
      });
    }

    // 排队预测：用 hash + party_size 生成稳定 waitlist
    let h = 0;
    const seedKey = `${p.poi_id}-${desired.toISOString().slice(0, 13)}`;
    for (const ch of seedKey) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const base = Math.abs(h) % 30;
    const queuePos = forcedBusy
      ? 75
      : Math.max(
          0,
          Math.min(45, base + Math.max(0, input.party_size - 2) * 2),
        );
    const etaMin = forcedBusy
      ? 75
      : p.reservation_supported
        ? Math.min(20, queuePos)
        : queuePos;

    const recommended = slots.find((s) => s.available_seats > 0)?.slot_id;

    return {
      poi_id: p.poi_id,
      poi_name: p.name,
      reservation_supported: p.reservation_supported,
      party_size: input.party_size,
      desired_time_iso: desired.toISOString(),
      slots,
      waitlist: {
        eta_minutes: etaMin,
        queue_position: queuePos,
        walk_in_eligible: !p.reservation_supported || queuePos > 0,
      },
      recommended_slot_id: recommended,
      open_hours_today: today,
    };
  },
});
