import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { isoDateTimeFromLlm } from "@/src/mastra/tools/nlu/coerce-iso-datetime";
import {
  assertTimelineFeasible,
  type TimelineNodeCore,
} from "@/src/domain/itinerary";

const timelineNodeSchema = z.object({
  node_id: z.string().min(1),
  label: z.string().min(1),
  start_time_iso: isoDateTimeFromLlm,
  end_time_iso: isoDateTimeFromLlm,
});

const validateTimelineFeasibilityInputSchema = z.object({
  timeline_nodes: z.array(timelineNodeSchema).min(1),
});

const validateTimelineFeasibilityOutputSchema = z.object({
  feasible: z.boolean(),
  checked_nodes_count: z.number().int().nonnegative(),
  overlap_pairs: z.array(z.tuple([z.string(), z.string()])),
});

export const validateTimelineFeasibilityTool = createTool({
  id: "validate_timeline_feasibility",
  description:
    "Validates if timeline nodes are feasible; emits structured RESOURCE_EXHAUSTED logs when overlaps exist.",
  inputSchema: validateTimelineFeasibilityInputSchema,
  outputSchema: validateTimelineFeasibilityOutputSchema,
  execute: async ({ timeline_nodes }) => {
    const nodes: TimelineNodeCore[] = timeline_nodes.map((n) => ({
      node_id: n.node_id,
      label: n.label,
      start_time_iso: String(n.start_time_iso),
      end_time_iso: String(n.end_time_iso),
    }));
    assertTimelineFeasible(nodes);
    return {
      feasible: true,
      checked_nodes_count: timeline_nodes.length,
      overlap_pairs: [],
    };
  },
});
