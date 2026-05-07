import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  buildResultLine,
  operationLineSchema,
  operationResultSchema,
} from "@/src/mastra/tools/execution/transaction-schema";
import { recordBundle } from "@/lib/plans/transaction-audit-store";
import { isAmapPoiId } from "@/lib/geo/amap-poi-adapter";

const executeTransactionBatchInputSchema = z
  .object({
    operations: z
      .array(operationLineSchema)
      .min(2, "多笔编排至少需要 2 条操作；单笔请用 execute_transaction")
      .max(12),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.operations.forEach((op, i) => {
      if (seen.has(op.idempotency_key)) {
        ctx.addIssue({
          code: "custom",
          message: `operations[${i}].idempotency_key 重复（每笔必须独立 UUID）`,
          path: ["operations", i, "idempotency_key"],
        });
      }
      seen.add(op.idempotency_key);

      if (op.action_type === "book_reservation" && !op.reservation) {
        ctx.addIssue({
          code: "custom",
          message: `operations[${i}] book_reservation 缺 reservation`,
          path: ["operations", i, "reservation"],
        });
      }
      if (
        (op.action_type === "gift_delivery" ||
          op.action_type === "grocery_delivery") &&
        !op.delivery
      ) {
        ctx.addIssue({
          code: "custom",
          message: `operations[${i}] ${op.action_type} 缺 delivery`,
          path: ["operations", i, "delivery"],
        });
      }
      if (op.action_type === "taxi_pickup" && !op.taxi) {
        ctx.addIssue({
          code: "custom",
          message: `operations[${i}] taxi_pickup 缺 taxi`,
          path: ["operations", i, "taxi"],
        });
      }
      if (typeof op.poi_id === "string" && isAmapPoiId(op.poi_id)) {
        ctx.addIssue({
          code: "custom",
          message: `operations[${i}] 使用了高德 POI（amap: 前缀），不能直接下单。请改用 seed POI`,
          path: ["operations", i, "poi_id"],
        });
      }
    });
  });

const executeTransactionBatchOutputSchema = z.object({
  status: z.literal("completed"),
  bundle_id: z.string().uuid(),
  line_count: z.number().int().nonnegative(),
  total_amount_cny: z.number().nonnegative(),
  total_discount_cny: z.number().nonnegative(),
  results: z.array(operationResultSchema),
  message: z.string(),
});

export const executeTransactionBatchTool = createTool({
  id: "execute_transaction_batch",
  description:
    "Mock 一键多笔编排：在同一次审批里提交 2–12 条互异的下单/预订/礼物配送/打车操作。每条都需独立 UUID idempotency_key；book_reservation/gift_delivery/grocery_delivery/taxi_pickup 必须带相应子对象。",
  requireApproval: true,
  inputSchema: executeTransactionBatchInputSchema,
  outputSchema: executeTransactionBatchOutputSchema,
  execute: async ({ operations }) => {
    const bundle_id = crypto.randomUUID();
    const results = operations.map(buildResultLine);
    const total = results.reduce((a, r) => a + (r.amount_cny ?? 0), 0);
    const discount = results.reduce(
      (a, r) => a + (r.applied_discount_cny ?? 0),
      0,
    );
    const message = `Mock 多笔编排已完成，共 ${results.length} 笔（bundle ${bundle_id.slice(0, 8)}…），合计预估 ¥${total}${
      discount > 0 ? `（含优惠 ¥${discount}）` : ""
    }`;
    await recordBundle({
      bundle_id,
      operations,
      results,
      message,
    });
    return {
      status: "completed" as const,
      bundle_id,
      line_count: results.length,
      total_amount_cny: Number(total.toFixed(0)),
      total_discount_cny: Number(discount.toFixed(0)),
      results,
      message,
    };
  },
});
