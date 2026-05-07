/**
 * search_enhanced_poi 的核心打分逻辑（纯函数）。
 *
 * 工具侧只负责：拿候选池、调 scoreCandidate、按分排序、切 limit。
 * 业务规则放这里，单测就能完全覆盖。
 *
 * v2 新增（赛题 P1 修复）：
 * - participants 群体构成会真正影响排序（孩子在场过滤夜生活、减肥者要求 low_cal、
 *   多人组进一步加 group_friendly 权重、couple 场景命中 couple_friendly）。
 */

import type { SeedPoi } from "./poi-seed";
import type { DietaryFilter, Scene } from "./taxonomy";

export type ParticipantSignal = {
  /** 是否含 12 岁以下孩童（0-12，含）。 */
  has_child_12_or_under: boolean;
  /** 是否有人在控制热量 / 减肥（preferences 含 low_cal）。 */
  has_dieting_member: boolean;
  /** 是否含轮椅 / 婴儿车需求。 */
  has_accessibility_need: boolean;
  /** 是否情侣组合（恰 2 人 + 一男一女） */
  is_couple_pair: boolean;
  /** 同行人数（用于触发 group_friendly 强加权）。 */
  party_size: number;
};

export type ScoringContext = {
  category_matrix: ReadonlyArray<SeedPoi["category"]>;
  budget_constraint: number;
  dietary_filters: ReadonlyArray<DietaryFilter>;
  scene: Scene;
  prefer_indoor: boolean;
  max_travel_km_from_home: number;
  /** 可选：群体构成信号；不传时退化到老规则（向下兼容）。 */
  participants?: ParticipantSignal;
};

export const SCENE_AFFINITY_TAGS: Record<Scene, ReadonlyArray<string>> = {
  family: ["kid_friendly", "stroller_friendly", "indoor"],
  friends: ["group_friendly", "photogenic", "supports_group_buy"],
  solo: ["quiet", "wifi"],
  unknown: [],
};

/** 排队时长的稳定估算：基于 poi_id hash + 评分 + 同行规模. */
export function deterministicWaitMinutes(
  p: SeedPoi,
  party_size: number,
): number {
  let h = 0;
  for (const ch of p.poi_id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const base = Math.abs(h) % 30;
  const popularity = Math.max(0, p.rating - 4) * 20;
  const groupPenalty = Math.max(0, party_size - 2) * 3;
  return Math.min(60, Math.round(base + popularity + groupPenalty));
}

/** 综合评分：0–100，附带可读的 reasons */
export function scoreCandidate(
  p: SeedPoi,
  ctx: ScoringContext,
  distance_km: number,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 50;

  if (ctx.category_matrix.includes(p.category)) {
    score += 12;
  } else {
    score -= 8;
    reasons.push(`类目 ${p.category} 不在主推矩阵`);
  }

  const sceneTags = SCENE_AFFINITY_TAGS[ctx.scene] ?? [];
  for (const tag of sceneTags) {
    if (p.tags.includes(tag as never)) {
      score += 4;
      reasons.push(`场景偏好命中 ${tag}`);
    }
  }

  for (const f of ctx.dietary_filters) {
    if (p.tags.includes(f)) {
      score += 8;
      reasons.push(`饮食偏好 ${f} 命中`);
    } else {
      score -= 4;
    }
  }

  if (ctx.prefer_indoor && p.tags.includes("indoor")) {
    score += 8;
    reasons.push("室内（雨天友好）");
  }

  // ── v2 群体构成硬约束（"老婆减肥 / 5 岁娃 / 4 个朋友" 真正影响排序） ──
  const participants = ctx.participants;
  if (participants) {
    if (participants.has_child_12_or_under) {
      // 5 岁娃在场，夜生活类不应出现
      if (p.category === "夜生活") {
        score -= 35;
        reasons.push("有未成年同行 → 夜生活类强降权");
      }
      if (p.tags.includes("kid_friendly")) {
        score += 10;
        reasons.push("kid_friendly 命中（含未成年）");
      } else if (p.category === "餐饮") {
        score -= 6;
        reasons.push("餐饮但缺 kid_friendly tag");
      }
    }
    if (participants.has_accessibility_need && p.tags.includes("stroller_friendly")) {
      score += 6;
      reasons.push("stroller_friendly 命中（轮椅/婴儿车）");
    }
    if (participants.has_dieting_member && p.category === "餐饮") {
      if (p.tags.includes("low_cal") || p.tags.includes("vegetarian_options")) {
        score += 12;
        reasons.push("有减肥同行 → low_cal/vegetarian 强加权");
      } else {
        score -= 8;
        reasons.push("有减肥同行但餐厅缺 low_cal/vegetarian");
      }
    }
    if (participants.is_couple_pair && p.tags.includes("couple_friendly")) {
      score += 8;
      reasons.push("情侣组合 → couple_friendly 命中");
    }
    if (participants.party_size >= 4 && p.tags.includes("group_friendly")) {
      score += 6;
      reasons.push(`${participants.party_size} 人组 → group_friendly 命中`);
    }
  }

  const distRatio = distance_km / Math.max(1, ctx.max_travel_km_from_home);
  if (distRatio <= 0.5) {
    score += 10;
    reasons.push(`离家约 ${distance_km}km，非常近`);
  } else if (distRatio <= 1) {
    score += 4;
    reasons.push(`离家约 ${distance_km}km，可接受`);
  }

  const budgetRatio = p.avg_per_person_cny / Math.max(1, ctx.budget_constraint);
  if (budgetRatio <= 0.6) {
    score += 6;
    reasons.push(`人均 ¥${p.avg_per_person_cny}，明显低于预算`);
  } else if (budgetRatio <= 1) {
    score += 2;
  } else if (budgetRatio <= 1.5) {
    score -= 4;
    reasons.push(`人均略超预算（¥${p.avg_per_person_cny}）`);
  } else {
    score -= 14;
    reasons.push(`人均 ¥${p.avg_per_person_cny} 远超预算`);
  }

  score += (p.rating - 4) * 6;
  if (p.rating >= 4.5) reasons.push(`评分 ${p.rating}`);

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  };
}

/**
 * 把 parse_outing_constraints 抽到的 participants 列表压缩成排序信号。
 * 单独导出便于工具层 + 单测复用。
 */
export function deriveParticipantSignal(args: {
  party_size: number;
  participants?: ReadonlyArray<{
    role: string;
    gender: string;
    age?: number;
    preferences?: ReadonlyArray<string>;
  }>;
}): ParticipantSignal {
  const list = args.participants ?? [];
  const has_child_12_or_under = list.some(
    (p) => (typeof p.age === "number" && p.age <= 12) || p.role === "child",
  );
  const has_dieting_member = list.some((p) =>
    (p.preferences ?? []).includes("low_cal"),
  );
  const has_accessibility_need = list.some((p) =>
    (p.preferences ?? []).includes("wheelchair_accessible"),
  );
  const males = list.filter((p) => p.gender === "male").length;
  const females = list.filter((p) => p.gender === "female").length;
  const is_couple_pair =
    args.party_size === 2 && males === 1 && females === 1;
  return {
    has_child_12_or_under,
    has_dieting_member,
    has_accessibility_need,
    is_couple_pair,
    party_size: args.party_size,
  };
}
