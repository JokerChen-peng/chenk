import { describe, expect, it } from "vitest";
import {
  AVG_PER_PERSON_BY_CATEGORY,
  inferAvgPerPersonFromText,
  makeCostBreakdown,
} from "@/src/domain/pricing";

describe("makeCostBreakdown", () => {
  it("party_size = 1 时 total = avg", () => {
    const out = makeCostBreakdown({ avg_per_person_cny: 78, party_size: 1 });
    expect(out.avg_per_person_cny).toBe(78);
    expect(out.total_for_party_cny).toBe(78);
    expect(out.party_size).toBe(1);
  });

  it("party_size=5 沙拉店：5×78 = 390（截图里那个被错标成『人均』的就是这个数）", () => {
    const out = makeCostBreakdown({ avg_per_person_cny: 78, party_size: 5 });
    expect(out.total_for_party_cny).toBe(390);
    expect(out.avg_per_person_cny).toBe(78);
  });

  it("非整数 party_size / 0 / 负数都被夹紧到 ≥1", () => {
    expect(makeCostBreakdown({ avg_per_person_cny: 100, party_size: 0 }).party_size).toBe(1);
    expect(makeCostBreakdown({ avg_per_person_cny: 100, party_size: -3 }).party_size).toBe(1);
    expect(makeCostBreakdown({ avg_per_person_cny: 100, party_size: 2.7 }).party_size).toBe(2);
  });

  it("总价四舍五入到整数", () => {
    const out = makeCostBreakdown({ avg_per_person_cny: 33.33, party_size: 3 });
    expect(out.total_for_party_cny).toBe(100);
  });
});

describe("inferAvgPerPersonFromText", () => {
  it("base case: 餐饮 → 110", () => {
    expect(inferAvgPerPersonFromText({ category: "餐饮" })).toBe(
      AVG_PER_PERSON_BY_CATEGORY["餐饮"],
    );
  });

  it("海底捞 / 高档 / 米其林 → ×1.6", () => {
    const got = inferAvgPerPersonFromText({
      category: "餐饮",
      category_path: "餐饮服务;火锅店;海底捞",
    });
    expect(got).toBe(Math.round(110 * 1.6));
  });

  it("小吃 / 快餐 → 至少 20，且不低于 0.5×", () => {
    const got = inferAvgPerPersonFromText({
      category: "餐饮",
      category_path: "餐饮服务;快餐厅",
    });
    expect(got).toBeGreaterThanOrEqual(20);
    expect(got).toBeLessThanOrEqual(110);
  });

  it("户外默认 0", () => {
    expect(inferAvgPerPersonFromText({ category: "户外" })).toBe(0);
  });
});
