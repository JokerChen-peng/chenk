import { beforeAll, describe, expect, it } from "vitest";
import {
  buildStructuredItineraryTool,
  calculateTransitRouteTool,
  checkRestaurantAvailabilityTool,
  executeTransactionBatchTool,
  findGroupBuyDealTool,
  getLocalWeatherTool,
  optimizeVisitOrderTool,
  parseOutingConstraintsTool,
  searchEnhancedPoiTool,
  validateGeoEnvelopeTool,
} from "@/src/mastra/tools";
import { RequestContext } from "@mastra/core/di";
import type { ToolExecutionContext } from "@mastra/core/tools";

type AnyTool = {
  execute: (
    input: unknown,
    context: ToolExecutionContext<unknown, unknown, unknown>,
  ) => Promise<unknown>;
};

function makeContext(): ToolExecutionContext<unknown, unknown, unknown> {
  return {
    requestContext: new RequestContext(),
  } as unknown as ToolExecutionContext<unknown, unknown, unknown>;
}

async function exec<T>(tool: AnyTool, input: unknown): Promise<T> {
  return (await tool.execute(input, makeContext())) as T;
}

beforeAll(() => {
  // 强制走 mock seed 路径，规避 Amap key / 网络抖动；保证 e2e 完全可重放
  process.env.MOCK_AGENT = "1";
});

describe("E2E · 家庭场景全链路（无 LLM）", () => {
  it("从一句话需求 → 定稿行程 → 多笔执行，全程通过", async () => {
    const anchor_iso = "2026-05-02T01:00:00.000Z"; // Asia/Shanghai 周六 09:00
    const query =
      "今天下午是空的，想和老婆孩子（5 岁）出去玩 4-6 小时，别离家太远，老婆最近在减肥。";

    type ParseOut = {
      scene: string;
      party_size: number;
      inferred_home_adcode: string;
      max_travel_km_from_home: number;
      budget_hint_cny: number;
      dietary_filters: string[];
      suggested_category_matrix: string[];
      time_semantics: { outing_date: string; window_start_iso: string };
    };

    const parsed = await exec<ParseOut>(
      parseOutingConstraintsTool as unknown as AnyTool,
      { user_message: query, anchor_iso_datetime: anchor_iso },
    );

    expect(parsed.scene).toBe("family");
    expect(parsed.party_size).toBeGreaterThanOrEqual(2);
    expect(parsed.suggested_category_matrix).toEqual(
      expect.arrayContaining(["餐饮"]),
    );

    const weather = await exec<{ prefer_indoor: boolean }>(
      getLocalWeatherTool as unknown as AnyTool,
      {
        adcode: parsed.inferred_home_adcode,
        date: parsed.time_semantics.outing_date,
      },
    );
    expect(typeof weather.prefer_indoor).toBe("boolean");

    type PoiHit = {
      poi_id: string;
      name: string;
      category: string;
      subcategory: string;
      avg_per_person_cny: number;
      estimated_cost: number;
      distance_from_home_km: number;
      reservation_supported: boolean;
    };
    const search = await exec<PoiHit[]>(
      searchEnhancedPoiTool as unknown as AnyTool,
      {
        adcode_boundary: parsed.inferred_home_adcode,
        category_matrix: parsed.suggested_category_matrix,
        budget_constraint: parsed.budget_hint_cny,
        dietary_filters: parsed.dietary_filters,
        party_size: parsed.party_size,
        scene: parsed.scene,
        max_travel_km_from_home: parsed.max_travel_km_from_home,
        prefer_indoor: weather.prefer_indoor,
        limit: 6,
      },
    );

    expect(search.length).toBeGreaterThanOrEqual(3);
    expect(search.some((p) => p.category !== "餐饮")).toBe(true);
    for (const p of search) {
      expect(p.distance_from_home_km).toBeLessThanOrEqual(
        parsed.max_travel_km_from_home,
      );
      expect(p.estimated_cost).toBe(
        Math.round(p.avg_per_person_cny * parsed.party_size),
      );
    }

    const restaurant = search.find((p) => p.category === "餐饮") ?? search[0]!;
    const others = search
      .filter((p) => p.poi_id !== restaurant.poi_id)
      .slice(0, 2);
    const orderedSeed = [
      others[0]?.poi_id,
      restaurant.poi_id,
      others[1]?.poi_id,
    ].filter(Boolean) as string[];

    if (restaurant.reservation_supported) {
      await exec(checkRestaurantAvailabilityTool as unknown as AnyTool, {
        poi_id: restaurant.poi_id,
        party_size: parsed.party_size,
        desired_time_iso: parsed.time_semantics.window_start_iso.replace(
          "T05",
          "T10",
        ),
      });
    }

    const deal = await exec<{
      deals: { coupon_code_for_apply: string; deal_cny: number }[];
    }>(findGroupBuyDealTool as unknown as AnyTool, {
      poi_id: restaurant.poi_id,
      party_size: parsed.party_size,
    });

    const opt = await exec<{ ordered_poi_ids: string[] }>(
      optimizeVisitOrderTool as unknown as AnyTool,
      {
        candidate_poi_ids: orderedSeed,
        home_adcode: parsed.inferred_home_adcode,
      },
    );
    expect(opt.ordered_poi_ids.length).toBeGreaterThanOrEqual(2);

    await exec(calculateTransitRouteTool as unknown as AnyTool, {
      ordered_poi_ids: opt.ordered_poi_ids,
      origin: { home_adcode: parsed.inferred_home_adcode },
      return_to_origin: true,
    });

    const env = await exec<{ feasible: boolean; violations: unknown[] }>(
      validateGeoEnvelopeTool as unknown as AnyTool,
      {
        home_adcode: parsed.inferred_home_adcode,
        candidate_poi_ids: opt.ordered_poi_ids,
        max_travel_km: parsed.max_travel_km_from_home,
      },
    );
    expect(env.feasible).toBe(true);
    expect(env.violations).toHaveLength(0);

    // 简单按时间窗扩段
    const start = new Date(parsed.time_semantics.window_start_iso);
    let cursor = start.getTime();
    const segs = opt.ordered_poi_ids.map((pid, i) => {
      const meta = search.find((p) => p.poi_id === pid)!;
      const isMeal = meta.category === "餐饮";
      const dur = isMeal ? 90 : 75;
      const end = cursor + dur * 60_000;
      const seg = {
        segment_id: `seg-${i + 1}`,
        kind: isMeal ? ("meal" as const) : ("play" as const),
        label: `${isMeal ? "用餐" : "活动"}：${meta.name}`,
        poi_id: pid,
        start_time_iso: new Date(cursor).toISOString(),
        end_time_iso: new Date(end).toISOString(),
        estimated_cost_cny: Math.round(
          meta.avg_per_person_cny * parsed.party_size,
        ),
      };
      cursor = end + 20 * 60_000;
      return seg;
    });

    expect(segs.some((s) => s.kind === "play")).toBe(true);

    const itin = await exec<{
      itinerary_id: string;
      segment_count: number;
      total_estimated_cost_cny: number;
      budget_status: string;
    }>(buildStructuredItineraryTool as unknown as AnyTool, {
      title: "家庭周末半日行（E2E）",
      segments: segs,
      party_size: parsed.party_size,
      budget_total_cny: parsed.budget_hint_cny * parsed.party_size,
    });

    expect(itin.segment_count).toBeGreaterThanOrEqual(2);
    expect(["ok", "tight", "over_budget", "unknown"]).toContain(
      itin.budget_status,
    );
    expect(itin.budget_status).not.toBe("over_budget");
    expect(itin.total_estimated_cost_cny).toBeGreaterThan(0);

    type BatchOut = {
      status: string;
      line_count: number;
      total_amount_cny: number;
      results: { mock_order_ref: string }[];
    };
    const batch = await exec<BatchOut>(
      executeTransactionBatchTool as unknown as AnyTool,
      {
        operations: [
          {
            poi_id: restaurant.poi_id,
            action_type: "book_reservation",
            idempotency_key: crypto.randomUUID(),
            label: `订座 · ${restaurant.name}`,
            related_segment_id: segs.find(
              (s) => s.poi_id === restaurant.poi_id,
            )?.segment_id,
            reservation: {
              party_size: parsed.party_size,
              desired_time_iso:
                segs.find((s) => s.poi_id === restaurant.poi_id)
                  ?.start_time_iso ??
                new Date(start.getTime() + 3 * 60 * 60_000).toISOString(),
            },
            coupon: deal.deals[0]
              ? {
                  code: deal.deals[0].coupon_code_for_apply,
                  discount_cny: Math.max(
                    0,
                    restaurant.avg_per_person_cny * parsed.party_size -
                      deal.deals[0].deal_cny,
                  ),
                }
              : undefined,
          },
          {
            poi_id: "gift-jingan-cake-01",
            action_type: "gift_delivery",
            idempotency_key: crypto.randomUUID(),
            label: "蛋糕送到餐厅",
            delivery: {
              target_poi_id: restaurant.poi_id,
              deliver_at_iso:
                segs.find((s) => s.poi_id === restaurant.poi_id)
                  ?.start_time_iso ??
                new Date(start.getTime() + 3 * 60 * 60_000).toISOString(),
              gift_type: "cake",
              message_card: "周末快乐",
            },
          },
        ],
      },
    );

    expect(batch.status).toBe("completed");
    expect(batch.line_count).toBe(2);
    expect(batch.results).toHaveLength(2);
    expect(batch.total_amount_cny).toBeGreaterThan(0);
  }, 60_000);
});
