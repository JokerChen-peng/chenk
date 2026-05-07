import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { isoDateTimeFromLlm } from "@/src/mastra/tools/nlu/coerce-iso-datetime";
import { recordBundle } from "@/lib/plans/transaction-audit-store";
import { buildResultLine } from "@/src/mastra/tools/execution/transaction-schema";

const inputSchema = z.object({
  poi_id: z.string().min(1),
  original_mock_order_ref: z.string().min(4),
  new_party_size: z.number().int().min(1).max(40),
  new_desired_time_iso: isoDateTimeFromLlm,
  cancel_idempotency_key: z.string().uuid(),
  rebook_idempotency_key: z.string().uuid(),
  reason: z.string().max(120).optional(),
});

const outputSchema = z.object({
  status: z.literal("completed"),
  bundle_id: z.string().uuid(),
  cancelled_mock_order_ref: z.string(),
  new_mock_order_ref: z.string(),
  message: z.string(),
});

export const modifyReservationTool = createTool({
  id: "modify_reservation",
  description:
    "Mock 改签订座：在一笔操作里取消旧的 mock_order_ref 并按 new_party_size + new_desired_time_iso 下一个新单。两个 idempotency_key 必须互异。需用户审批。",
  requireApproval: true,
  inputSchema,
  outputSchema,
  execute: async (input) => {
    if (input.cancel_idempotency_key === input.rebook_idempotency_key) {
      throw new Error("cancel 与 rebook 的 idempotency_key 必须不同");
    }
    const cancelOp = {
      poi_id: input.poi_id,
      action_type: "cancel_booking" as const,
      idempotency_key: input.cancel_idempotency_key,
      label: `取消旧订座（${input.original_mock_order_ref}）`,
      expected_amount_cny: 0,
    };
    const rebookOp = {
      poi_id: input.poi_id,
      action_type: "book_reservation" as const,
      idempotency_key: input.rebook_idempotency_key,
      label: `重新订座 ${input.new_party_size} 人`,
      reservation: {
        party_size: input.new_party_size,
        desired_time_iso: String(input.new_desired_time_iso),
      },
    };
    const cancelResult = buildResultLine(cancelOp);
    const rebookResult = buildResultLine(rebookOp);
    const bundle_id = crypto.randomUUID();
    const message = `Mock 改签完成：取消 ${input.original_mock_order_ref}，新单 ${rebookResult.mock_order_ref}${
      input.reason ? `（原因：${input.reason}）` : ""
    }`;
    await recordBundle({
      bundle_id,
      operations: [cancelOp, rebookOp],
      results: [cancelResult, rebookResult],
      message,
    });
    return {
      status: "completed" as const,
      bundle_id,
      cancelled_mock_order_ref: input.original_mock_order_ref,
      new_mock_order_ref: rebookResult.mock_order_ref,
      message,
    };
  },
});
