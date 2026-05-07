/**
 * 价格相关纯函数。把"人均 vs 全员合计"的语义集中到一处，避免 UI / 工具 / 行程
 * 三层各自乘除导致一处当人均、一处当总价。
 */

import type { PoiCategory } from "./taxonomy";

/** 这一轮"人均"和"全员合计"的语义命名 */
export type CostBreakdown = {
  /** 人均参考（CNY） */
  avg_per_person_cny: number;
  /** 总价 = 人均 × party_size，四舍五入到整数 */
  total_for_party_cny: number;
  /** 同行人数 */
  party_size: number;
};

export function makeCostBreakdown(args: {
  avg_per_person_cny: number;
  party_size: number;
}): CostBreakdown {
  const party = Math.max(1, Math.floor(args.party_size));
  return {
    avg_per_person_cny: args.avg_per_person_cny,
    total_for_party_cny: Math.round(args.avg_per_person_cny * party),
    party_size: party,
  };
}

/** Amap POI 失去价格信息时按主类目兜底；和 amap-poi-adapter 共用 */
export const AVG_PER_PERSON_BY_CATEGORY: Record<PoiCategory, number> = {
  餐饮: 110,
  咖啡: 38,
  亲子: 95,
  展览: 60,
  户外: 0,
  夜生活: 180,
};

/** 给定主类目和原始 path/name，给出一个稳定的人均估算（不会随机） */
export function inferAvgPerPersonFromText(args: {
  category: PoiCategory;
  category_path?: string;
  name?: string;
}): number {
  const path = args.category_path ?? "";
  const name = args.name ?? "";
  const base = AVG_PER_PERSON_BY_CATEGORY[args.category];
  if (/海底捞|高档|米其林|和牛/.test(path) || /高档|米其林|和牛/.test(name)) {
    return Math.round(base * 1.6);
  }
  if (/小吃|快餐/.test(path)) {
    return Math.max(20, Math.round(base * 0.5));
  }
  return base;
}
