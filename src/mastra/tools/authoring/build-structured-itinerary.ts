import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  assertTimelineFeasible,
  type TimelineNodeCore,
} from "@/src/domain/itinerary";
import { isoDateTimeFromLlm } from "@/src/mastra/tools/nlu/coerce-iso-datetime";

const segmentKindSchema = z.enum([
  "play",
  "meal",
  "transit",
  "buffer",
  "shopping",
  "gift",
  "other",
]);

const itinerarySegmentSchema = z.object({
  segment_id: z.string().min(1),
  kind: segmentKindSchema,
  label: z.string().min(1),
  poi_id: z.string().optional(),
  start_time_iso: isoDateTimeFromLlm,
  end_time_iso: isoDateTimeFromLlm,
  estimated_cost_cny: z
    .number()
    .nonnegative()
    .max(50_000)
    .optional()
    .describe("该段预估总花费（CNY，已乘 party_size）"),
  notes: z.string().optional(),
});

const buildStructuredItineraryInputSchema = z.object({
  title: z.string().min(1).optional(),
  segments: z.array(itinerarySegmentSchema).min(1),
  party_size: z.number().int().min(1).max(40).optional(),
  budget_total_cny: z
    .number()
    .nonnegative()
    .optional()
    .describe("用户给的总预算红线；若提供，total cost 超过会抛错"),
  /** 出发前提醒（行程级），相对第一段开始时间倒推；前端可订到 mock 通知中心 */
  reminders: z
    .array(
      z.object({
        offset_minutes_before_start: z.number().int().min(1).max(180),
        message: z.string().min(1).max(160),
      }),
    )
    .max(5)
    .optional(),
});

const buildStructuredItineraryOutputSchema = z.object({
  itinerary_id: z.string().uuid(),
  title: z.string(),
  segment_count: z.number().int().nonnegative(),
  segments: z.array(itinerarySegmentSchema),
  total_estimated_cost_cny: z.number().nonnegative(),
  budget_total_cny: z.number().nonnegative().optional(),
  budget_status: z.enum(["ok", "tight", "over_budget", "unknown"]),
  reminders: z
    .array(
      z.object({
        reminder_id: z.string(),
        fire_at_iso: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
  validation: z.literal("passed"),
});

export const buildStructuredItineraryTool = createTool({
  id: "build_structured_itinerary",
  description:
    "把当前规划定稿成结构化行程：检查 segment 时间是否重叠、汇总预算、生成出发提醒。重叠或超预算（提供 budget_total_cny 时）会被工具拒绝。",
  inputSchema: buildStructuredItineraryInputSchema,
  outputSchema: buildStructuredItineraryOutputSchema,
  execute: async (input) => {
    const nodes: TimelineNodeCore[] = input.segments.map((s) => ({
      node_id: s.segment_id,
      label: s.label,
      start_time_iso: String(s.start_time_iso),
      end_time_iso: String(s.end_time_iso),
    }));
    assertTimelineFeasible(nodes);

    const total = input.segments.reduce(
      (a, s) => a + (s.estimated_cost_cny ?? 0),
      0,
    );

    let budget_status: "ok" | "tight" | "over_budget" | "unknown" = "unknown";
    if (input.budget_total_cny != null) {
      const ratio = total / Math.max(1, input.budget_total_cny);
      if (ratio > 1.0) {
        const violation = {
          code: "BUDGET_EXCEEDED",
          message: `行程预估 ¥${total.toFixed(0)} 超过预算红线 ¥${input.budget_total_cny}`,
          total_estimated_cost_cny: Math.round(total),
          budget_total_cny: input.budget_total_cny,
        };
        console.error(JSON.stringify(violation));
        throw new Error(JSON.stringify(violation));
      }
      budget_status = ratio > 0.9 ? "tight" : "ok";
    }

    const itinerary_id = crypto.randomUUID();

    const sortedStarts = [...input.segments]
      .map((s) => new Date(String(s.start_time_iso)).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);
    const firstStart = sortedStarts[0];
    const reminders =
      firstStart != null && input.reminders && input.reminders.length > 0
        ? input.reminders.map((r) => ({
            reminder_id: crypto.randomUUID(),
            fire_at_iso: new Date(
              firstStart - r.offset_minutes_before_start * 60_000,
            ).toISOString(),
            message: r.message,
          }))
        : undefined;

    return {
      itinerary_id,
      title: input.title ?? "Outing plan",
      segment_count: input.segments.length,
      segments: input.segments,
      total_estimated_cost_cny: Number(total.toFixed(0)),
      budget_total_cny: input.budget_total_cny,
      budget_status,
      reminders,
      validation: "passed" as const,
    };
  },
});
