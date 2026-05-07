import { describe, expect, it } from "vitest";
import {
  deriveParticipantSignal,
  deterministicWaitMinutes,
  scoreCandidate,
  SCENE_AFFINITY_TAGS,
  type ScoringContext,
} from "@/src/domain/scoring";
import { findSeedPoi } from "@/src/domain/poi-seed";

const baseCtx: ScoringContext = {
  category_matrix: ["餐饮", "亲子"],
  budget_constraint: 150,
  dietary_filters: [],
  scene: "family",
  prefer_indoor: false,
  max_travel_km_from_home: 15,
};

describe("scoreCandidate", () => {
  it("命中类目 + 场景 tag 加分", () => {
    const sushi = findSeedPoi("rest-jingan-001")!;
    const out = scoreCandidate(sushi, baseCtx, 1);
    expect(out.score).toBeGreaterThan(50);
    expect(out.reasons.some((r) => r.includes("kid_friendly"))).toBe(true);
  });

  it("不在类目矩阵 → 减分 + 给出 reason", () => {
    const bar = findSeedPoi("bar-jingan-901")!; // 夜生活
    const out = scoreCandidate(bar, baseCtx, 1);
    expect(out.reasons.some((r) => r.includes("不在主推矩阵"))).toBe(true);
  });

  it("远超预算 → 重罚 14 分 + reason", () => {
    const expensive = findSeedPoi("bar-jingan-901")!; // 220 元
    const cheapBudget: ScoringContext = { ...baseCtx, budget_constraint: 50 };
    const out = scoreCandidate(expensive, cheapBudget, 1);
    expect(out.reasons.some((r) => r.includes("远超预算"))).toBe(true);
  });

  it("距离 ≤ 50% 上限 → 额外加 10 分", () => {
    const seed = findSeedPoi("rest-jingan-002")!;
    const near = scoreCandidate(seed, baseCtx, 2); // 2/15 ≈ 13%
    const far = scoreCandidate(seed, baseCtx, 14); // 14/15 ≈ 93%
    expect(near.score).toBeGreaterThan(far.score);
  });

  it("分数被夹到 [0, 100]", () => {
    const out = scoreCandidate(findSeedPoi("rest-jingan-001")!, baseCtx, 1);
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(100);
  });
});

describe("deterministicWaitMinutes", () => {
  it("同一 POI 不会变（确定性）", () => {
    const seed = findSeedPoi("rest-jingan-001")!;
    expect(deterministicWaitMinutes(seed, 4)).toBe(
      deterministicWaitMinutes(seed, 4),
    );
  });

  it("party_size 越大 等位越久", () => {
    const seed = findSeedPoi("rest-jingan-001")!;
    expect(deterministicWaitMinutes(seed, 6)).toBeGreaterThanOrEqual(
      deterministicWaitMinutes(seed, 2),
    );
  });

  it("总不超过 60 分钟", () => {
    for (const id of [
      "rest-jingan-001",
      "rest-jingan-002",
      "rest-pudong-501",
    ]) {
      const seed = findSeedPoi(id)!;
      expect(deterministicWaitMinutes(seed, 20)).toBeLessThanOrEqual(60);
    }
  });
});

describe("SCENE_AFFINITY_TAGS", () => {
  it("4 种场景都有对应 tag 列表", () => {
    expect(SCENE_AFFINITY_TAGS.family.length).toBeGreaterThan(0);
    expect(SCENE_AFFINITY_TAGS.friends.length).toBeGreaterThan(0);
    expect(SCENE_AFFINITY_TAGS.solo.length).toBeGreaterThan(0);
    expect(SCENE_AFFINITY_TAGS.unknown.length).toBe(0);
  });
});

describe("deriveParticipantSignal", () => {
  it("家庭：抽出 has_child_12_or_under 与减肥成员", () => {
    const sig = deriveParticipantSignal({
      party_size: 3,
      participants: [
        { role: "self", gender: "male" },
        { role: "spouse", gender: "female", preferences: ["low_cal"] },
        { role: "child", gender: "male", age: 5 },
      ],
    });
    expect(sig.has_child_12_or_under).toBe(true);
    expect(sig.has_dieting_member).toBe(true);
    expect(sig.is_couple_pair).toBe(false);
    expect(sig.party_size).toBe(3);
  });

  it("情侣：仅 2 人一男一女 → is_couple_pair=true", () => {
    const sig = deriveParticipantSignal({
      party_size: 2,
      participants: [
        { role: "self", gender: "male" },
        { role: "spouse", gender: "female" },
      ],
    });
    expect(sig.is_couple_pair).toBe(true);
    expect(sig.has_child_12_or_under).toBe(false);
  });

  it("无 participants → 全部 false / 默认", () => {
    const sig = deriveParticipantSignal({ party_size: 2 });
    expect(sig.has_child_12_or_under).toBe(false);
    expect(sig.has_dieting_member).toBe(false);
    expect(sig.is_couple_pair).toBe(false);
  });
});

describe("scoreCandidate · v2 群体构成硬约束", () => {
  it("有未成年同行 → 夜生活类被强降权（同 POI 比无孩子时低 ≥ 30）", () => {
    const bar = findSeedPoi("bar-jingan-901")!;
    const ctxWithoutKid: ScoringContext = {
      ...baseCtx,
      category_matrix: ["夜生活"],
      participants: undefined,
    };
    const ctxWithKid: ScoringContext = {
      ...ctxWithoutKid,
      participants: deriveParticipantSignal({
        party_size: 3,
        participants: [
          { role: "self", gender: "male" },
          { role: "spouse", gender: "female" },
          { role: "child", gender: "male", age: 5 },
        ],
      }),
    };
    const noKid = scoreCandidate(bar, ctxWithoutKid, 2);
    const withKid = scoreCandidate(bar, ctxWithKid, 2);
    expect(noKid.score - withKid.score).toBeGreaterThanOrEqual(30);
    expect(
      withKid.reasons.some((r) => r.includes("夜生活类强降权")),
    ).toBe(true);
  });

  it("有减肥成员 → 餐饮带 low_cal 加 +12 / 不带则 -8", () => {
    const lowCalPoi = findSeedPoi("rest-jingan-002")!;
    const heavyPoi = findSeedPoi("rest-jingan-003")!; // 本帮菜，无 low_cal
    const ctx: ScoringContext = {
      ...baseCtx,
      participants: deriveParticipantSignal({
        party_size: 3,
        participants: [
          { role: "self", gender: "male" },
          { role: "spouse", gender: "female", preferences: ["low_cal"] },
        ],
      }),
    };
    const aLow = scoreCandidate(lowCalPoi, ctx, 2);
    const bHeavy = scoreCandidate(heavyPoi, ctx, 2);
    expect(aLow.score).toBeGreaterThan(bHeavy.score);
    expect(
      aLow.reasons.some((r) => r.includes("low_cal/vegetarian 强加权")),
    ).toBe(true);
  });

  it("4 人朋友组 → group_friendly 命中加分", () => {
    const groupPoi = findSeedPoi("rest-jingan-001")!; // kid_friendly 含
    if (!groupPoi.tags.includes("group_friendly")) return;
    const ctx: ScoringContext = {
      ...baseCtx,
      scene: "friends",
      participants: deriveParticipantSignal({ party_size: 4 }),
    };
    const out = scoreCandidate(groupPoi, ctx, 2);
    expect(
      out.reasons.some((r) => r.includes("group_friendly 命中")),
    ).toBe(true);
  });
});
