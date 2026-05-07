#!/usr/bin/env tsx
/**
 * 命令行 Demo：跳过 LLM，直接按 brief 中两个场景串行调用 Mock 工具，输出完整执行计划。
 * 用法：
 *   npx tsx scripts/run-cli.ts                # 默认家庭场景
 *   npx tsx scripts/run-cli.ts --friends      # 朋友场景
 *   npx tsx scripts/run-cli.ts --query "..."  # 自定义自然语言（仍然是规则化解析）
 */

import {
  buildStructuredItineraryTool,
  calculateTransitRouteTool,
  checkRestaurantAvailabilityTool,
  executeTransactionBatchTool,
  fetchShareFeedbackTool,
  findGroupBuyDealTool,
  getLocalWeatherTool,
  optimizeVisitOrderTool,
  parseOutingConstraintsTool,
  proposePlanAlternativesTool,
  searchEnhancedPoiTool,
  shareOutingSummaryTool,
  validateGeoEnvelopeTool,
} from "@/src/mastra/tools";
import { appendFeedback } from "@/lib/share/share-feedback-store";
import type { ToolExecutionContext } from "@mastra/core/tools";
import { RequestContext } from "@mastra/core/di";

type AnyTool = {
  execute: (input: unknown, context: ToolExecutionContext<unknown, unknown, unknown>) => Promise<unknown>;
};

function makeContext(): ToolExecutionContext<unknown, unknown, unknown> {
  return {
    requestContext: new RequestContext(),
  } as unknown as ToolExecutionContext<unknown, unknown, unknown>;
}

async function run<T>(
  label: string,
  tool: { execute: (input: unknown, context: ToolExecutionContext<unknown, unknown, unknown>) => Promise<unknown> },
  input: unknown,
): Promise<T> {
  process.stdout.write(`\n[STEP] ${label}\n`);
  const out = await tool.execute(input, makeContext());
  console.log(JSON.stringify(out, null, 2));
  return out as T;
}

function pickArg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function chooseQuery(): { query: string; anchor_iso: string } {
  const explicit = pickArg("--query");
  if (explicit) {
    return { query: explicit, anchor_iso: new Date().toISOString() };
  }
  const friends = process.argv.includes("--friends");
  // 演示用周六上午 9 点
  const anchor_iso = "2026-05-02T01:00:00.000Z"; // = Asia/Shanghai 周六 09:00
  if (friends) {
    return {
      query:
        "今天下午是空的，4 个朋友（2 男 2 女）想出去玩 4 小时，先逛展览再吃饭，别离家太远。",
      anchor_iso,
    };
  }
  return {
    query:
      "今天下午是空的，想和老婆孩子（5 岁）出去玩 4-6 小时，别离家太远，老婆最近在减肥。",
    anchor_iso,
  };
}

async function main() {
  const { query, anchor_iso } = chooseQuery();
  console.log("============ Local Outing CLI Demo ============");
  console.log(`Query:  ${query}`);
  console.log(`Anchor: ${anchor_iso}\n`);

  const parsed = await run<{
    scene: string;
    party_size: number;
    inferred_home_adcode: string;
    max_travel_km_from_home: number;
    budget_hint_cny: number;
    dietary_filters: string[];
    suggested_category_matrix: string[];
    time_semantics: {
      outing_date: string;
      window_start_iso: string;
      window_end_iso: string;
      window_clock_start: string;
      window_clock_end: string;
      is_peak_window: boolean;
      is_weekend: boolean;
    };
  }>("parse_outing_constraints", parseOutingConstraintsTool as unknown as AnyTool, {
    user_message: query,
    anchor_iso_datetime: anchor_iso,
  });

  const weather = await run<{ prefer_indoor: boolean; summary: string }>(
    "get_local_weather",
    getLocalWeatherTool as unknown as AnyTool,
    { adcode: parsed.inferred_home_adcode, date: parsed.time_semantics.outing_date },
  );

  const search = await run<
    {
      poi_id: string;
      name: string;
      category: string;
      subcategory: string;
      avg_per_person_cny: number;
      distance_from_home_km: number;
      reservation_supported: boolean;
    }[]
  >("search_enhanced_poi", searchEnhancedPoiTool as unknown as AnyTool, {
    adcode_boundary: parsed.inferred_home_adcode,
    category_matrix: parsed.suggested_category_matrix,
    budget_constraint: parsed.budget_hint_cny,
    dietary_filters: parsed.dietary_filters,
    party_size: parsed.party_size,
    scene: parsed.scene,
    max_travel_km_from_home: parsed.max_travel_km_from_home,
    prefer_indoor: weather.prefer_indoor,
    limit: 6,
  });

  if (search.length < 2) {
    throw new Error("候选 POI 不足，无法继续 Demo");
  }
  const wantBusy = process.argv.includes("--busy");
  const allRestaurants = search.filter((p) => p.category === "餐饮");
  let restaurant = allRestaurants[0] ?? search[0]!;
  if (wantBusy && allRestaurants[0]) {
    process.env.OUTING_BUSY_POI_IDS = allRestaurants[0].poi_id;
    console.log(
      `\n[demo] --busy enabled → 把首选餐厅 ${allRestaurants[0].name} 模拟为爆满，演示自动切备选。`,
    );
  }

  type Avail = {
    poi_id: string;
    poi_name: string;
    slots: { available_seats: number }[];
    waitlist: { eta_minutes: number };
    recommended_slot_id?: string;
  };
  if (restaurant.reservation_supported) {
    const avail = await run<Avail>(
      "check_restaurant_availability",
      checkRestaurantAvailabilityTool as unknown as AnyTool,
      {
        poi_id: restaurant.poi_id,
        party_size: parsed.party_size,
        desired_time_iso: parsed.time_semantics.window_start_iso.replace("T05", "T10"),
      },
    );
    const noSlot =
      !avail.recommended_slot_id ||
      avail.slots.every((s) => s.available_seats === 0);
    if (noSlot) {
      const backup = allRestaurants.find((p) => p.poi_id !== restaurant.poi_id);
      if (!backup) {
        console.log(
          `\n[recovery] ${avail.poi_name} 全时段已满，且没有同区备选餐厅，跳过订座。`,
        );
      } else {
        console.log(
          `\n[recovery] ${avail.poi_name} 全部已订满（${avail.waitlist.eta_minutes}分钟队），切到备选 ${backup.name}（poi=${backup.poi_id}）。`,
        );
        restaurant = backup;
        await run(
          "check_restaurant_availability (backup)",
          checkRestaurantAvailabilityTool as unknown as AnyTool,
          {
            poi_id: restaurant.poi_id,
            party_size: parsed.party_size,
            desired_time_iso: parsed.time_semantics.window_start_iso.replace("T05", "T10"),
          },
        );
      }
    }
  }

  // 决定 restaurant 之后再排前后两段，避免 recovery-switch 后 ordered 指向旧 POI
  const nonRestaurants = search.filter(
    (p) => p.category !== "餐饮" && p.poi_id !== restaurant.poi_id,
  );
  const fallback = search.filter((p) => p.poi_id !== restaurant.poi_id);
  const others = (
    nonRestaurants.length >= 2
      ? nonRestaurants.slice(0, 2)
      : [...nonRestaurants, ...fallback].slice(0, 2)
  ) as typeof search;
  const ordered = [
    others[0]?.poi_id,
    restaurant.poi_id,
    others[1]?.poi_id,
  ].filter(Boolean) as string[];

  const deal = await run<{
    deals: { coupon_code_for_apply: string; deal_cny: number; title: string }[];
  }>("find_group_buy_deal", findGroupBuyDealTool as unknown as AnyTool, {
    poi_id: restaurant.poi_id,
    party_size: parsed.party_size,
  });

  const opt = await run<{ ordered_poi_ids: string[] }>(
    "optimize_visit_order",
    optimizeVisitOrderTool as unknown as AnyTool,
    {
      candidate_poi_ids: ordered,
      home_adcode: parsed.inferred_home_adcode,
    },
  );

  await run(
    "calculate_transit_route",
    calculateTransitRouteTool as unknown as AnyTool,
    {
      ordered_poi_ids: opt.ordered_poi_ids,
      origin: { home_adcode: parsed.inferred_home_adcode },
      return_to_origin: true,
    },
  );

  await run(
    "validate_geo_envelope",
    validateGeoEnvelopeTool as unknown as AnyTool,
    {
      home_adcode: parsed.inferred_home_adcode,
      candidate_poi_ids: opt.ordered_poi_ids,
      max_travel_km: parsed.max_travel_km_from_home,
    },
  );

  // Build segments by spreading the time window
  const start = new Date(parsed.time_semantics.window_start_iso);
  const segs: {
    segment_id: string;
    kind: "play" | "meal" | "transit" | "buffer";
    label: string;
    poi_id?: string;
    start_time_iso: string;
    end_time_iso: string;
    estimated_cost_cny?: number;
    notes?: string;
  }[] = [];
  let cursor = start.getTime();
  for (let i = 0; i < opt.ordered_poi_ids.length; i++) {
    const pid = opt.ordered_poi_ids[i]!;
    const meta = search.find((p) => p.poi_id === pid)!;
    const isMeal = meta.category === "餐饮";
    const dur = isMeal ? 90 : 75;
    const end = cursor + dur * 60_000;
    segs.push({
      segment_id: `seg-${i + 1}`,
      kind: isMeal ? "meal" : "play",
      label: `${isMeal ? "用餐" : "活动"}：${meta.name}`,
      poi_id: pid,
      start_time_iso: new Date(cursor).toISOString(),
      end_time_iso: new Date(end).toISOString(),
      estimated_cost_cny: Math.round(meta.avg_per_person_cny * parsed.party_size),
      notes: meta.subcategory,
    });
    cursor = end + 20 * 60_000;
  }

  const itin = await run<{
    itinerary_id: string;
    total_estimated_cost_cny: number;
    budget_status: string;
    reminders?: { reminder_id: string; fire_at_iso: string; message: string }[];
  }>(
    "build_structured_itinerary",
    buildStructuredItineraryTool as unknown as AnyTool,
    {
      title: parsed.scene === "family" ? "家庭周末半日行" : "朋友下午聚",
      segments: segs,
      party_size: parsed.party_size,
      // Demo 给一个稍宽的预算上限，避免种子数据里偶尔的高人均把演示打断；
      // 真实流程里 LLM 会主动换 POI、调时长。
      budget_total_cny: Math.round(
        parsed.budget_hint_cny * parsed.party_size * 1.6,
      ),
      reminders: [
        { offset_minutes_before_start: 60, message: "出发前 1 小时提醒：检查孩子物品 / 充电宝" },
        { offset_minutes_before_start: 30, message: "出发前 30 分钟提醒：可叫车" },
      ],
    },
  );

  await run(
    "propose_plan_alternatives",
    proposePlanAlternativesTool as unknown as AnyTool,
    {
      base_title: itin.itinerary_id,
      axes: ["budget", "indoor_vs_outdoor"],
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
          tagline: "把最贵的一段砍掉，整体预算降一档",
          // 选「成本最高的一段」之外的段；保证 ≥1 段、≤8 段，与 schema 兼容。
          segments: (() => {
            if (segs.length <= 1) {
              return segs.map((s) => ({
                segment_id: s.segment_id,
                poi_id: s.poi_id,
                label: `${s.label}（精简）`,
                start_time_iso: s.start_time_iso,
                end_time_iso: s.end_time_iso,
                estimated_cost_cny: Math.round((s.estimated_cost_cny ?? 0) * 0.6),
              }));
            }
            const idxMostExpensive = segs.reduce(
              (best, s, i) =>
                (s.estimated_cost_cny ?? 0) >
                (segs[best]?.estimated_cost_cny ?? 0)
                  ? i
                  : best,
              0,
            );
            return segs
              .filter((_, i) => i !== idxMostExpensive)
              .map((s) => ({
                segment_id: s.segment_id,
                poi_id: s.poi_id,
                label: s.label,
                start_time_iso: s.start_time_iso,
                end_time_iso: s.end_time_iso,
                estimated_cost_cny: Math.round((s.estimated_cost_cny ?? 0) * 0.85),
              }));
          })(),
        },
      ],
    },
  );

  type ShareOut = {
    share_path: string;
    recipient_label: string;
    preview_headline: string;
  };
  const share = await run<ShareOut>(
    "share_outing_summary",
    shareOutingSummaryTool as unknown as AnyTool,
    {
      recipient_label: parsed.scene === "family" ? "老婆" : "小张",
      audience: parsed.scene === "family" ? "family" : "friends",
      headline: parsed.scene === "family" ? "下午带娃 outing 安排" : "下午朋友聚会安排",
      bullets: segs.map(
        (s) => `${new Date(s.start_time_iso).toLocaleTimeString("zh-CN")} · ${s.label}`,
      ),
      channel: "wechat_mock",
    },
  );
  const shareToken = share.share_path.split("/").filter(Boolean).pop() ?? "";

  // —— 模拟亲友点了 👍 + 一句吐槽 —— //
  if (shareToken) {
    await appendFeedback({
      token: shareToken,
      reaction: "thumbs_up",
      reviewer_label: parsed.scene === "family" ? "老婆" : "小张",
      comment:
        parsed.scene === "family"
          ? "可以！下午孩子状态应该不错，记得带湿巾"
          : "OK 走起。带相机",
    });
    await appendFeedback({
      token: shareToken,
      reaction: "neutral",
      reviewer_label: "我自己（备注）",
      comment: "提醒：出门前手机充满电",
    });
    process.stdout.write("\n[STEP] (mock) 亲友给方案点了 👍 并加了一条评论\n");
  }

  await run(
    "fetch_share_feedback",
    fetchShareFeedbackTool as unknown as AnyTool,
    { share_token: shareToken },
  );

  // 终极一键：订座 + 蛋糕送到餐厅 + 出发打车（如果只是 demo，可省略）
  const operations = [
    {
      poi_id: restaurant.poi_id,
      action_type: "book_reservation" as const,
      idempotency_key: crypto.randomUUID(),
      label: `订座 · ${restaurant.name}`,
      related_segment_id: segs.find((s) => s.poi_id === restaurant.poi_id)?.segment_id,
      reservation: {
        party_size: parsed.party_size,
        desired_time_iso: segs.find((s) => s.poi_id === restaurant.poi_id)?.start_time_iso ??
          new Date(start.getTime() + 3 * 60 * 60_000).toISOString(),
      },
      coupon: deal.deals[0]
        ? {
            code: deal.deals[0].coupon_code_for_apply,
            discount_cny: Math.max(0, restaurant.avg_per_person_cny * parsed.party_size - deal.deals[0].deal_cny),
          }
        : undefined,
    },
    {
      poi_id: "gift-jingan-cake-01",
      action_type: "gift_delivery" as const,
      idempotency_key: crypto.randomUUID(),
      label: "蛋糕送到餐厅",
      delivery: {
        target_poi_id: restaurant.poi_id,
        deliver_at_iso: segs.find((s) => s.poi_id === restaurant.poi_id)?.start_time_iso ??
          new Date(start.getTime() + 3 * 60 * 60_000).toISOString(),
        gift_type: "cake" as const,
        message_card: "周末快乐 ❤",
      },
    },
  ];

  await run(
    "execute_transaction_batch",
    executeTransactionBatchTool as unknown as AnyTool,
    { operations },
  );

  console.log("\n============ DONE ============");
}

void main().catch((e) => {
  console.error("CLI run failed:", e);
  process.exitCode = 1;
});
