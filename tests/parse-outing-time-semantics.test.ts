import { describe, expect, it } from "vitest";
import {
  cnNumeralToInt,
  extractCount,
  inferTimeSemantics,
} from "@/src/mastra/tools/nlu/parse-outing-time-semantics";

// 用上海时区固定锚点：周六 09:00 上海 = 周六 01:00Z (4 月 25 日 = 周六)
const SAT_0900_SH = new Date("2026-04-25T01:00:00.000Z");

describe("inferTimeSemantics", () => {
  it("locks today + afternoon to 13:00–18:00 with high confidence", () => {
    const r = inferTimeSemantics(
      "今天下午是空的，想出去玩",
      SAT_0900_SH,
    );
    expect(r.outing_date).toBe("2026-04-25");
    expect(r.window_label).toBe("afternoon");
    expect(r.window_clock_start).toBe("13:00");
    expect(r.window_clock_end).toBe("18:00");
    expect(r.confidence).toBe("high");
    expect(r.is_weekend).toBe(true);
    expect(r.is_peak_window).toBe(true);
  });

  it("explicit 下午2点到6点 resolves to 14:00–18:00", () => {
    const r = inferTimeSemantics(
      "今天下午2点到6点，我一个人想去附近转转",
      SAT_0900_SH,
    );
    expect(r.outing_date).toBe("2026-04-25");
    expect(r.window_label).toBe("afternoon");
    expect(r.window_clock_start).toBe("14:00");
    expect(r.window_clock_end).toBe("18:00");
    expect(r.confidence).toBe("high");
  });

  it("recognizes 明天 as anchor + 1 day", () => {
    const r = inferTimeSemantics("明天上午", SAT_0900_SH);
    expect(r.outing_date).toBe("2026-04-26");
    expect(r.window_label).toBe("morning");
  });

  it("falls through to default window when nothing matches", () => {
    const r = inferTimeSemantics("帮我安排一下", SAT_0900_SH);
    expect(r.window_label).toBe("unspecified");
    expect(r.window_clock_start).toBe("10:00");
    expect(r.window_clock_end).toBe("20:00");
  });

  it("recognizes Chinese holidays (劳动节)", () => {
    const labour = new Date("2026-05-01T01:00:00.000Z");
    const r = inferTimeSemantics("今天下午", labour);
    expect(r.holiday_name).toBe("劳动节");
  });

  it("emits ISO strings that round-trip", () => {
    const r = inferTimeSemantics("今天下午", SAT_0900_SH);
    expect(Number.isFinite(new Date(r.window_start_iso).getTime())).toBe(true);
    expect(Number.isFinite(new Date(r.window_end_iso).getTime())).toBe(true);
    expect(new Date(r.window_end_iso).getTime()).toBeGreaterThan(
      new Date(r.window_start_iso).getTime(),
    );
  });

  it("中文小时：「四个小时」/「四小时」→ 4h 窗口", () => {
    const r = inferTimeSemantics("想出去玩四个小时", SAT_0900_SH);
    // 没指明午晚 → 默认 afternoon 14:00 + 4h = 18:00
    expect(r.window_label).toBe("afternoon");
    expect(r.window_clock_start).toBe("14:00");
    expect(r.window_clock_end).toBe("18:00");
  });

  it("「四小时」（无 个）也能识别", () => {
    const r = inferTimeSemantics("聚四小时就回", SAT_0900_SH);
    expect(r.window_clock_end).not.toBe("20:00"); // 不能是默认的 fallback
  });

  it("「想喝点酒」→ window=evening 18:00 起", () => {
    const r = inferTimeSemantics("三个人想喝点酒", SAT_0900_SH);
    expect(r.window_label).toBe("evening");
    expect(r.window_clock_start).toBe("18:00");
  });

  it("「想喝点酒，四个小时」→ evening 18:00–22:00", () => {
    const r = inferTimeSemantics("三个人想喝点酒四个小时", SAT_0900_SH);
    expect(r.window_label).toBe("evening");
    expect(r.window_clock_start).toBe("18:00");
    expect(r.window_clock_end).toBe("22:00");
  });
});

describe("cnNumeralToInt", () => {
  it("阿拉伯数字直通", () => {
    expect(cnNumeralToInt("3")).toBe(3);
    expect(cnNumeralToInt("12")).toBe(12);
  });
  it("单字中文 0–10", () => {
    expect(cnNumeralToInt("零")).toBe(0);
    expect(cnNumeralToInt("一")).toBe(1);
    expect(cnNumeralToInt("两")).toBe(2);
    expect(cnNumeralToInt("三")).toBe(3);
    expect(cnNumeralToInt("十")).toBe(10);
  });
  it("十一 / 二十 / 三十五", () => {
    expect(cnNumeralToInt("十一")).toBe(11);
    expect(cnNumeralToInt("二十")).toBe(20);
    expect(cnNumeralToInt("三十五")).toBe(35);
  });
  it("不识别返回 null", () => {
    expect(cnNumeralToInt("壹佰")).toBeNull();
    expect(cnNumeralToInt("")).toBeNull();
  });
});

describe("extractCount", () => {
  it("「三个人」→ 3", () => {
    expect(extractCount("三个人想喝点酒", "(?:个\\s*)?(?:人|位)")).toBe(3);
  });
  it("「四个小时」→ 4", () => {
    expect(extractCount("四个小时", "(?:个\\s*)?(?:半\\s*)?小时")).toBe(4);
  });
  it("「两个人」→ 2", () => {
    expect(extractCount("两个人去吃饭", "(?:个\\s*)?(?:人|位)")).toBe(2);
  });
  it("「3 人」→ 3（带空格的阿拉伯数字）", () => {
    expect(extractCount("3 人 出门", "(?:个\\s*)?(?:人|位)")).toBe(3);
  });
  it("找不到返回 null", () => {
    expect(extractCount("hello world", "(?:个\\s*)?(?:人|位)")).toBeNull();
  });
});
