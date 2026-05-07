import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  buildResultLine,
  operationLineSchema,
  operationResultSchema,
  transactionActionSchema,
} from "@/src/mastra/tools/execution/transaction-schema";
import { recordBundle } from "@/lib/plans/transaction-audit-store";
import { isAmapPoiId } from "@/lib/geo/amap-poi-adapter";

const executeTransactionInputSchema = operationLineSchema.superRefine((op, ctx) => {
  if (op.action_type === "book_reservation" && !op.reservation) {
    ctx.addIssue({
      code: "custom",
      message: "book_reservation 必须提供 reservation 详情（party_size + desired_time_iso）",
      path: ["reservation"],
    });
  }
  if (
    (op.action_type === "gift_delivery" ||
      op.action_type === "grocery_delivery") &&
    !op.delivery
  ) {
    ctx.addIssue({
      code: "custom",
      message: `${op.action_type} 必须提供 delivery 详情（target_poi_id 或 delivery_address + deliver_at_iso）`,
      path: ["delivery"],
    });
  }
  if (op.action_type === "taxi_pickup" && !op.taxi) {
    ctx.addIssue({
      code: "custom",
      message: "taxi_pickup 必须提供 taxi 详情（destination_poi_id + pickup_at_iso）",
      path: ["taxi"],
    });
  }
  if (typeof op.poi_id === "string" && isAmapPoiId(op.poi_id)) {
    ctx.addIssue({
      code: "custom",
      message:
        "高德 POI（amap: 前缀）只是搜索归一化候选，不能直接下单。请先用 search_enhanced_poi 在 seed 库中找到等价的美团 POI（或在 brief 中标注此 POI 仅用于浏览）。",
      path: ["poi_id"],
    });
  }
});

const executeTransactionOutputSchema = z.object({
  status: z.literal("completed"),
  result: operationResultSchema,
  message: z.string(),
});

export const executeTransactionTool = createTool({
  id: "execute_transaction",
  description:
    "Mock 单笔下单 / 预订 / 取消 / 礼物配送 / 打车 等。需用户在前端 approval 后才会真正调用。book_reservation 必须带 reservation 子对象（party_size + desired_time_iso）；gift_delivery 必须带 delivery；taxi_pickup 必须带 taxi。",
  requireApproval: true,
  inputSchema: executeTransactionInputSchema,
  outputSchema: executeTransactionOutputSchema,
  execute: async (input) => {
    const result = buildResultLine(input);
    await recordBundle({
      bundle_id: crypto.randomUUID(),
      operations: [input],
      results: [result],
      message: `Mock 单笔已完成（${input.action_type}）`,
    });
    return {
      status: "completed" as const,
      result,
      message: "Mock transaction completed (human-approved).",
    };
  },
});

export { transactionActionSchema };
