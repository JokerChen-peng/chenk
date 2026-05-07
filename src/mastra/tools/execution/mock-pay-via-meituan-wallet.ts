import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const inputSchema = z.object({
  mock_order_ref: z.string().min(4),
  amount_cny: z.number().nonnegative(),
  channel: z
    .enum(["meituan_wallet", "wechat_pay", "alipay", "cash"])
    .optional(),
});

const outputSchema = z.object({
  status: z.literal("paid"),
  mock_order_ref: z.string(),
  amount_cny: z.number().nonnegative(),
  channel: z.enum(["meituan_wallet", "wechat_pay", "alipay", "cash"]),
  paid_at: z.string(),
  receipt_id: z.string(),
});

export const mockPayViaMeituanWalletTool = createTool({
  id: "mock_pay_via_meituan_wallet",
  description:
    "Mock 美团钱包/微信/支付宝/现金支付：把已存在的 mock_order_ref 标记为已支付。仅做 demo 演示，不会真扣钱。",
  requireApproval: true,
  inputSchema,
  outputSchema,
  execute: async ({ mock_order_ref, amount_cny, channel }) => {
    const ch: "meituan_wallet" | "wechat_pay" | "alipay" | "cash" =
      channel ?? "meituan_wallet";
    return {
      status: "paid" as const,
      mock_order_ref,
      amount_cny: Number(amount_cny.toFixed(0)),
      channel: ch,
      paid_at: new Date().toISOString(),
      receipt_id: `rcpt-${crypto.randomUUID().slice(0, 8)}`,
    };
  },
});
