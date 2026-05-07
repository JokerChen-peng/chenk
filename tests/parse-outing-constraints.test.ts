import { describe, expect, it } from "vitest";
import { parseOutingConstraintsTool } from "@/src/mastra/tools/nlu/parse-outing-constraints";
import { RequestContext } from "@mastra/core/di";
import type { ToolExecutionContext } from "@mastra/core/tools";

function makeCtx(): ToolExecutionContext<unknown, unknown, unknown> {
  return {
    requestContext: new RequestContext(),
  } as unknown as ToolExecutionContext<unknown, unknown, unknown>;
}

type ParticipantOut = {
  role: string;
  gender: "male" | "female" | "unspecified";
  age?: number;
  preferences: string[];
};
type ParseOut = {
  scene: "family" | "friends" | "solo" | "unknown";
  duration_hours_target: number;
  party_size: number;
  participants: ParticipantOut[];
  dietary_filters: string[];
  activity_hints: string[];
  suggested_category_matrix: string[];
  budget_hint_cny: number;
  max_travel_km_from_home: number;
  inferred_home_adcode: string;
  time_semantics: {
    outing_date: string;
    window_label: string;
    window_clock_start: string;
    window_clock_end: string;
    window_start_iso: string;
    window_end_iso: string;
  };
  overridden_fields: string[];
};

type ParseInput = Parameters<NonNullable<typeof parseOutingConstraintsTool.execute>>[0];

async function run(input: ParseInput): Promise<ParseOut> {
  const exec = parseOutingConstraintsTool.execute;
  if (!exec) throw new Error("execute missing");
  const out = await exec(input, makeCtx());
  return out as unknown as ParseOut;
}

const SAT_0900_SH = "2026-04-25T01:00:00.000Z";

describe("parse_outing_constraints · 中文数字 + 酒吧场景", () => {
  it("「三个人，想喝点酒，四个小时」→ 3 人 / 4h / 夜生活", async () => {
    const r = await run({
      user_message: "三个人，想喝点酒，四个小时",
      anchor_iso_datetime: SAT_0900_SH,
    });
    expect(r.scene).toBe("friends");
    expect(r.party_size).toBe(3);
    expect(r.participants).toHaveLength(3);
    // 没显式说性别 → 都 unspecified，不要凭空捏造
    for (const p of r.participants) {
      expect(p.gender).toBe("unspecified");
    }
    expect(r.duration_hours_target).toBe(4);
    expect(r.time_semantics.window_label).toBe("evening");
    expect(r.time_semantics.window_clock_start).toBe("18:00");
    expect(r.time_semantics.window_clock_end).toBe("22:00");
    expect(r.suggested_category_matrix).toContain("夜生活");
    expect(r.activity_hints).toContain("夜生活");
  });

  it("「2男2女去酒吧」→ friends + 男女均显式", async () => {
    const r = await run({
      user_message: "2男2女找个酒吧聚一下，3 小时",
      anchor_iso_datetime: SAT_0900_SH,
    });
    expect(r.scene).toBe("friends");
    expect(r.party_size).toBe(4);
    const males = r.participants.filter((p) => p.gender === "male").length;
    const females = r.participants.filter((p) => p.gender === "female").length;
    expect(males).toBe(2);
    expect(females).toBe(2);
    expect(r.duration_hours_target).toBe(3);
    expect(r.suggested_category_matrix).toContain("夜生活");
  });

  it("「两人下午茶」→ 2 人 + 咖啡", async () => {
    const r = await run({
      user_message: "两人想找个地方喝下午茶",
      anchor_iso_datetime: SAT_0900_SH,
    });
    expect(r.party_size).toBe(2);
    expect(r.suggested_category_matrix).toContain("咖啡");
  });

  it("家庭场景仍生效（孩子优先级 > 数字+人）", async () => {
    const r = await run({
      user_message: "和老婆孩子三个人出去玩，老婆减肥，5 岁娃，四个小时",
      anchor_iso_datetime: SAT_0900_SH,
    });
    expect(r.scene).toBe("family");
    expect(r.party_size).toBe(3);
    expect(r.participants.find((p) => p.role === "spouse")?.preferences).toContain(
      "low_cal",
    );
    expect(r.participants.find((p) => p.role === "child")?.age).toBe(5);
    expect(r.dietary_filters).toContain("low_cal");
    expect(r.dietary_filters).toContain("kid_friendly");
    expect(r.duration_hours_target).toBe(4);
  });

  it("家庭场景默认带活动类目，不会只剩餐饮", async () => {
    const r = await run({
      user_message: "今天下午想和老婆孩子出去玩几个小时，别离家太远",
      anchor_iso_datetime: SAT_0900_SH,
    });
    expect(r.scene).toBe("family");
    expect(r.suggested_category_matrix).toEqual(
      expect.arrayContaining(["亲子", "餐饮"]),
    );
    expect(r.suggested_category_matrix.some((c) => c !== "餐饮")).toBe(true);
  });
});

describe("parse_outing_constraints · parsed_overrides 优先级", () => {
  it("LLM 给的 party_size 覆盖 regex baseline，且自动补 participants", async () => {
    const r = await run({
      user_message: "出去玩玩",
      anchor_iso_datetime: SAT_0900_SH,
      parsed_overrides: {
        scene: "friends",
        party_size: 5,
      },
    });
    expect(r.scene).toBe("friends");
    expect(r.party_size).toBe(5);
    expect(r.participants).toHaveLength(5);
    expect(r.overridden_fields).toEqual(
      expect.arrayContaining(["scene", "party_size"]),
    );
  });

  it("LLM 给的 participants 自动决定 party_size", async () => {
    const r = await run({
      user_message: "随便",
      anchor_iso_datetime: SAT_0900_SH,
      parsed_overrides: {
        participants: [
          { role: "self", gender: "unspecified", preferences: [] },
          { role: "parent", gender: "female", age: 60, preferences: ["wheelchair_accessible"] },
          { role: "parent", gender: "male", age: 65, preferences: ["wheelchair_accessible"] },
        ],
      },
    });
    expect(r.party_size).toBe(3);
    expect(r.participants.filter((p) => p.role === "parent")).toHaveLength(2);
    expect(r.overridden_fields).toEqual(
      expect.arrayContaining(["participants", "party_size"]),
    );
  });

  it("LLM 给 outing_date + window 时，重算 window_*_iso", async () => {
    const r = await run({
      user_message: "啥时候都行",
      anchor_iso_datetime: SAT_0900_SH,
      parsed_overrides: {
        outing_date: "2026-05-09",
        window_label: "evening",
        window_clock_start: "18:30",
        window_clock_end: "22:30",
      },
    });
    expect(r.time_semantics.outing_date).toBe("2026-05-09");
    expect(r.time_semantics.window_clock_start).toBe("18:30");
    expect(r.time_semantics.window_clock_end).toBe("22:30");
    expect(r.time_semantics.window_start_iso).toBe(
      "2026-05-09T18:30:00+08:00",
    );
    expect(r.time_semantics.window_end_iso).toBe(
      "2026-05-09T22:30:00+08:00",
    );
    expect(r.duration_hours_target).toBe(4);
    expect(r.overridden_fields).toEqual(
      expect.arrayContaining([
        "outing_date",
        "window_label",
        "window_clock_start",
        "window_clock_end",
      ]),
    );
  });

  it("LLM 只给 duration → window_clock_end 按 start + duration 自动算", async () => {
    const r = await run({
      user_message: "不知道几点",
      anchor_iso_datetime: SAT_0900_SH,
      parsed_overrides: {
        window_clock_start: "15:00",
        duration_hours_target: 5,
      },
    });
    expect(r.time_semantics.window_clock_start).toBe("15:00");
    expect(r.time_semantics.window_clock_end).toBe("20:00");
    expect(r.duration_hours_target).toBe(5);
    expect(r.overridden_fields).toEqual(
      expect.arrayContaining(["duration_hours_target", "window_clock_end"]),
    );
  });

  it("LLM 给 budget / max_travel / category，全部生效", async () => {
    const r = await run({
      user_message: "出去玩",
      anchor_iso_datetime: SAT_0900_SH,
      parsed_overrides: {
        budget_hint_cny: 1500,
        max_travel_km_from_home: 25,
        suggested_category_matrix: ["夜生活", "餐饮"],
      },
    });
    expect(r.budget_hint_cny).toBe(1500);
    expect(r.max_travel_km_from_home).toBe(25);
    expect(r.suggested_category_matrix).toEqual(["夜生活", "餐饮"]);
    expect(r.overridden_fields).toEqual(
      expect.arrayContaining([
        "budget_hint_cny",
        "max_travel_km_from_home",
        "suggested_category_matrix",
      ]),
    );
  });

  it("没传 overrides 时 overridden_fields 为空（向后兼容）", async () => {
    const r = await run({
      user_message: "三个人，想喝点酒，四个小时",
      anchor_iso_datetime: SAT_0900_SH,
    });
    expect(r.overridden_fields).toEqual([]);
    expect(r.party_size).toBe(3);
    expect(r.duration_hours_target).toBe(4);
  });

  it("regex 抽不到的边缘说法（带女朋友），靠 LLM override 也能正确", async () => {
    const r = await run({
      user_message: "下班后带女朋友吃个饭",
      anchor_iso_datetime: SAT_0900_SH,
      parsed_overrides: {
        scene: "friends",
        party_size: 2,
        participants: [
          { role: "self", gender: "unspecified", preferences: [] },
          { role: "friend", gender: "female", preferences: ["couple_friendly"] },
        ],
        window_label: "evening",
        window_clock_start: "19:00",
        window_clock_end: "21:00",
        suggested_category_matrix: ["餐饮"],
      },
    });
    expect(r.scene).toBe("friends");
    expect(r.party_size).toBe(2);
    expect(r.time_semantics.window_clock_start).toBe("19:00");
    expect(r.duration_hours_target).toBe(2);
  });
});
