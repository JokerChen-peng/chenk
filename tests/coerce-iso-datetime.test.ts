import { describe, expect, it } from "vitest";
import { coerceToIsoString } from "@/src/mastra/tools/nlu/coerce-iso-datetime";

describe("coerceToIsoString", () => {
  it("normalises space separator into T", () => {
    expect(coerceToIsoString("2026-04-25 14:00:00")).toBe(
      "2026-04-25T14:00:00.000Z",
    );
  });

  it("appends Z when missing", () => {
    expect(coerceToIsoString("2026-04-25T14:00:00")).toBe(
      "2026-04-25T14:00:00.000Z",
    );
  });

  it("pads single-digit seconds", () => {
    expect(coerceToIsoString("2026-04-25T14:00:0Z")).toBe(
      "2026-04-25T14:00:00.000Z",
    );
  });

  it("inserts seconds when missing in T15:00Z form", () => {
    expect(coerceToIsoString("2026-04-25T14:00Z")).toBe(
      "2026-04-25T14:00:00.000Z",
    );
  });

  it("preserves explicit timezone offsets", () => {
    expect(coerceToIsoString("2026-04-25T14:00:00+08:00")).toBe(
      "2026-04-25T06:00:00.000Z",
    );
  });

  it("throws on garbage", () => {
    expect(() => coerceToIsoString("not-a-date")).toThrow();
  });
});
