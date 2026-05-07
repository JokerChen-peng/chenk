import { beforeAll, describe, expect, it } from "vitest";
import {
  buildStructuredItineraryTool,
  calculateTransitRouteTool,
  optimizeVisitOrderTool,
  parseOutingConstraintsTool,
  proposePlanAlternativesTool,
  searchEnhancedPoiTool,
  shareOutingSummaryTool,
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
  process.env.MOCK_AGENT = "1";
});

describe("E2E · 朋友场景全链路（无 LLM）", () => {
  it("从「4 个朋友看展再吃饭」→ 定稿 → A/B 备选 → 分享", async () => {
    const anchor_iso = "2026-05-02T01:00:00.000Z";
    const query =
      "今天下午是空的，4 个朋友（2 男 2 女）想出去玩 4 小时，先逛展览再吃饭，别离家太远。";

    type ParseOut = {
      scene: string;
      party_size: number;
      inferred_home_adcode: string;
      max_travel_km_from_home: number;
      budget_hint_cny: number;
      dietary_filters: string[];
      suggested_category_matrix: string[];
      time_semantics: { window_start_iso: string };
    };
    const parsed = await exec<ParseOut>(
      parseOutingConstraintsTool as unknown as AnyTool,
      { user_message: query, anchor_iso_datetime: anchor_iso },
    );

    expect(parsed.scene).toBe("friends");
    expect(parsed.party_size).toBeGreaterThanOrEqual(3);
    expect(parsed.suggested_category_matrix).toEqual(
      expect.arrayContaining(["展览"]),
    );

    type PoiHit = {
      poi_id: string;
      name: string;
      category: string;
      avg_per_person_cny: number;
      estimated_cost: number;
      distance_from_home_km: number;
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
        prefer_indoor: false,
        limit: 6,
      },
    );
    expect(search.length).toBeGreaterThanOrEqual(3);

    const exhibit = search.find((p) => p.category === "展览") ?? search[0]!;
    const restaurant = search.find((p) => p.category === "餐饮") ?? search[1]!;
    const orderedSeed = [exhibit.poi_id, restaurant.poi_id]
      .filter(Boolean)
      .slice(0, 3);

    const opt = await exec<{ ordered_poi_ids: string[] }>(
      optimizeVisitOrderTool as unknown as AnyTool,
      {
        candidate_poi_ids: orderedSeed,
        home_adcode: parsed.inferred_home_adcode,
      },
    );
    expect(opt.ordered_poi_ids.length).toBe(orderedSeed.length);

    await exec(calculateTransitRouteTool as unknown as AnyTool, {
      ordered_poi_ids: opt.ordered_poi_ids,
      origin: { home_adcode: parsed.inferred_home_adcode },
      return_to_origin: false,
    });

    const env = await exec<{ feasible: boolean }>(
      validateGeoEnvelopeTool as unknown as AnyTool,
      {
        home_adcode: parsed.inferred_home_adcode,
        candidate_poi_ids: opt.ordered_poi_ids,
        max_travel_km: parsed.max_travel_km_from_home,
      },
    );
    expect(env.feasible).toBe(true);

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

    const itin = await exec<{
      itinerary_id: string;
      segment_count: number;
      budget_status: string;
    }>(buildStructuredItineraryTool as unknown as AnyTool, {
      title: "朋友下午聚（E2E）",
      segments: segs,
      party_size: parsed.party_size,
      budget_total_cny: parsed.budget_hint_cny * parsed.party_size,
    });

    expect(itin.segment_count).toBeGreaterThanOrEqual(2);
    expect(itin.budget_status).not.toBe("over_budget");

    const alt = await exec<{ options: { option_id: string }[] }>(
      proposePlanAlternativesTool as unknown as AnyTool,
      {
        base_title: itin.itinerary_id,
        axes: ["budget"],
        options: [
          {
            option_id: "A",
            title: "原方案（含餐）",
            tagline: "按用户输入定稿",
            segments: segs.map((s) => ({
              segment_id: s.segment_id,
              poi_id: s.poi_id,
              label: s.label,
              start_time_iso: s.start_time_iso,
              end_time_iso: s.end_time_iso,
              estimated_cost_cny: s.estimated_cost_cny,
            })),
          },
          {
            option_id: "B",
            title: "省钱版",
            tagline: "改成 citywalk + 自助小吃",
            segments: segs.map((s) => ({
              segment_id: s.segment_id,
              poi_id: s.poi_id,
              label: s.label,
              start_time_iso: s.start_time_iso,
              end_time_iso: s.end_time_iso,
              estimated_cost_cny: Math.round((s.estimated_cost_cny ?? 0) * 0.5),
            })),
          },
        ],
      },
    );
    expect(alt.options).toHaveLength(2);
    expect(alt.options.map((o) => o.option_id).sort()).toEqual(["A", "B"]);

    type ShareOut = { share_path: string; preview_headline: string };
    const share = await exec<ShareOut>(
      shareOutingSummaryTool as unknown as AnyTool,
      {
        recipient_label: "小张",
        audience: "friends",
        headline: "下午朋友聚会安排",
        bullets: segs.map(
          (s) =>
            `${new Date(s.start_time_iso).toLocaleTimeString("zh-CN")} · ${s.label}`,
        ),
        channel: "wechat_mock",
      },
    );
    expect(share.share_path.startsWith("/share/")).toBe(true);
    expect(share.preview_headline.length).toBeGreaterThan(0);
  }, 60_000);
});
