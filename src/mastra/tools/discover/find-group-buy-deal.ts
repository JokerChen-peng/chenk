import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { findSeedPoi } from "@/src/domain/poi-seed";

const inputSchema = z.object({
  poi_id: z.string().min(1),
  party_size: z.number().int().min(1).max(40).optional(),
});

const outputSchema = z.object({
  poi_id: z.string(),
  poi_name: z.string(),
  deals: z.array(
    z.object({
      deal_id: z.string(),
      title: z.string(),
      original_cny: z.number().nonnegative(),
      deal_cny: z.number().nonnegative(),
      savings_cny: z.number().nonnegative(),
      best_for_party_size: z.number().int().nonnegative(),
      coupon_code_for_apply: z.string(),
    }),
  ),
  message: z.string(),
});

function partyAffinity(title: string): number {
  if (/四人|4人/.test(title)) return 4;
  if (/三人|3人/.test(title)) return 3;
  if (/二大一小|2大1小/.test(title)) return 3;
  if (/双人|2人/.test(title)) return 2;
  return 1;
}

export const findGroupBuyDealTool = createTool({
  id: "find_group_buy_deal",
  description:
    "查询某个 POI 的团购套餐（Mock seed 中存在则返回，否则返回空）。返回的 coupon_code_for_apply 可作为 execute_transaction 中 coupon.code 使用。",
  inputSchema,
  outputSchema,
  execute: async (input) => {
    const party_size = input.party_size ?? 2;
    const poi = findSeedPoi(input.poi_id);
    if (!poi) {
      throw new Error(JSON.stringify({ code: "NOT_FOUND", poi_id: input.poi_id }));
    }
    const deals = (poi.group_buy_deals ?? []).map((d) => ({
      deal_id: d.deal_id,
      title: d.title,
      original_cny: d.original_cny,
      deal_cny: d.deal_cny,
      savings_cny: Math.max(0, d.original_cny - d.deal_cny),
      best_for_party_size: partyAffinity(d.title),
      coupon_code_for_apply: `GB-${d.deal_id.toUpperCase()}`,
    }));
    deals.sort(
      (a, b) =>
        Math.abs(a.best_for_party_size - party_size) -
        Math.abs(b.best_for_party_size - party_size),
    );
    return {
      poi_id: poi.poi_id,
      poi_name: poi.name,
      deals,
      message:
        deals.length > 0
          ? `找到 ${deals.length} 个团购套餐，最适合 ${party_size} 人的：${deals[0]!.title} 省 ¥${deals[0]!.savings_cny}`
          : "该 POI 暂无团购套餐",
    };
  },
});
