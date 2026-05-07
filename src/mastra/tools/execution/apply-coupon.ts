import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { findSeedPoi } from "@/src/domain/poi-seed";

const inputSchema = z.object({
  poi_id: z.string().min(1),
  coupon_code: z.string().min(2).max(40),
  base_amount_cny: z
    .number()
    .nonnegative()
    .describe("用券前预估金额（CNY），通常等于人均 × party_size"),
});

const outputSchema = z.object({
  poi_id: z.string(),
  coupon_code: z.string(),
  applicable: z.boolean(),
  discount_cny: z.number().nonnegative(),
  final_amount_cny: z.number().nonnegative(),
  reason: z.string(),
});

export const applyCouponTool = createTool({
  id: "apply_coupon",
  description:
    "Mock 校验某个团购券码 / 平台券是否可用并算出折扣。GB-* 前缀走 seed 内套餐折扣；其他码视为通用满减（满 200-30）。",
  inputSchema,
  outputSchema,
  execute: async ({ poi_id, coupon_code, base_amount_cny }) => {
    const upper = coupon_code.toUpperCase();
    if (upper.startsWith("GB-")) {
      const dealId = upper.slice(3).toLowerCase();
      const poi = findSeedPoi(poi_id);
      const deal = poi?.group_buy_deals?.find((d) => d.deal_id === dealId);
      if (!poi || !deal) {
        return {
          poi_id,
          coupon_code,
          applicable: false,
          discount_cny: 0,
          final_amount_cny: base_amount_cny,
          reason: "团购券与 POI 不匹配",
        };
      }
      const savings = Math.max(0, deal.original_cny - deal.deal_cny);
      const final_amount = Math.max(0, base_amount_cny - savings);
      return {
        poi_id,
        coupon_code,
        applicable: true,
        discount_cny: savings,
        final_amount_cny: Number(final_amount.toFixed(0)),
        reason: `团购套餐「${deal.title}」立减 ¥${savings}`,
      };
    }
    if (base_amount_cny >= 200) {
      const discount = Math.min(30, base_amount_cny * 0.15);
      return {
        poi_id,
        coupon_code,
        applicable: true,
        discount_cny: Math.round(discount),
        final_amount_cny: Number((base_amount_cny - discount).toFixed(0)),
        reason: "通用满 200 减 30 已生效",
      };
    }
    return {
      poi_id,
      coupon_code,
      applicable: false,
      discount_cny: 0,
      final_amount_cny: base_amount_cny,
      reason: "未达到通用券满减门槛（满 200 元）",
    };
  },
});
