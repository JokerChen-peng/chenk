import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const optionAxisSchema = z.enum([
  "indoor_vs_outdoor",
  "budget",
  "kid_friendly",
  "low_cal",
  "social_intensity",
  "distance",
]);

const optionLineSchema = z.object({
  segment_id: z.string().min(1),
  poi_id: z.string().min(1).optional(),
  label: z.string().min(1).max(80),
  start_time_iso: z.string().min(1),
  end_time_iso: z.string().min(1),
  estimated_cost_cny: z.number().nonnegative().optional(),
});

const inputSchema = z.object({
  base_title: z.string().min(1).max(80),
  axes: z.array(optionAxisSchema).min(1).max(3),
  options: z
    .array(
      z.object({
        option_id: z.string().min(1).max(40),
        title: z.string().min(1).max(80),
        tagline: z.string().min(1).max(160),
        segments: z.array(optionLineSchema).min(1).max(8),
      }),
    )
    .min(2)
    .max(4),
});

const outputSchema = z.object({
  proposal_id: z.string().uuid(),
  base_title: z.string(),
  axes: z.array(optionAxisSchema),
  options: z.array(
    z.object({
      option_id: z.string(),
      title: z.string(),
      tagline: z.string(),
      total_estimated_cost_cny: z.number().nonnegative(),
      segments: z.array(optionLineSchema),
    }),
  ),
  recommended_option_id: z.string(),
  message: z.string(),
});

export const proposePlanAlternativesTool = createTool({
  id: "propose_plan_alternatives",
  description:
    "把方案做 A/B/C 三选一对比卡（例如「室内 vs 户外」「松弛 vs 紧凑」「亲子 vs 浪漫」），便于用户递给老婆/朋友选。每个 option 含 title + tagline + segments。返回时会用各选项 cost 选出推荐项。不会落地行程；定稿仍走 build_structured_itinerary。",
  inputSchema,
  outputSchema,
  execute: async (input) => {
    const totals = input.options.map((o) => ({
      option_id: o.option_id,
      total: o.segments.reduce((a, s) => a + (s.estimated_cost_cny ?? 0), 0),
    }));
    // 默认推荐：成本最低且 segments 数 ≥ 2 的；如果都一样取第一个
    const recommended =
      totals
        .slice()
        .sort((a, b) => a.total - b.total)
        .find((t) => {
          const opt = input.options.find((o) => o.option_id === t.option_id);
          return opt ? opt.segments.length >= 2 : false;
        })?.option_id ?? input.options[0]!.option_id;

    return {
      proposal_id: crypto.randomUUID(),
      base_title: input.base_title,
      axes: input.axes,
      options: input.options.map((o) => ({
        option_id: o.option_id,
        title: o.title,
        tagline: o.tagline,
        total_estimated_cost_cny: Number(
          o.segments.reduce((a, s) => a + (s.estimated_cost_cny ?? 0), 0).toFixed(0),
        ),
        segments: o.segments,
      })),
      recommended_option_id: recommended,
      message: `已生成 ${input.options.length} 个备选；推荐：${recommended}。`,
    };
  },
});
