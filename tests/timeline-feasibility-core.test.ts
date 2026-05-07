import { describe, expect, it } from "vitest";
import {
  assertTimelineFeasible,
  assertValidNodeRange,
  findOverlapPairs,
} from "@/src/domain/itinerary";

const node = (id: string, start: string, end: string) => ({
  node_id: id,
  label: id,
  start_time_iso: start,
  end_time_iso: end,
});

describe("findOverlapPairs", () => {
  it("returns no pairs for non-overlapping segments", () => {
    expect(
      findOverlapPairs([
        node("a", "2026-04-25T13:00:00Z", "2026-04-25T14:00:00Z"),
        node("b", "2026-04-25T14:00:00Z", "2026-04-25T15:00:00Z"),
      ]),
    ).toEqual([]);
  });

  it("detects partial overlap", () => {
    expect(
      findOverlapPairs([
        node("a", "2026-04-25T13:00:00Z", "2026-04-25T14:30:00Z"),
        node("b", "2026-04-25T14:00:00Z", "2026-04-25T15:00:00Z"),
      ]),
    ).toEqual([["a", "b"]]);
  });

  it("treats touching segments (end == next start) as ok", () => {
    expect(
      findOverlapPairs([
        node("a", "2026-04-25T13:00:00Z", "2026-04-25T14:00:00Z"),
        node("b", "2026-04-25T14:00:00Z", "2026-04-25T15:00:00Z"),
      ]),
    ).toEqual([]);
  });
});

describe("assertValidNodeRange", () => {
  it("rejects zero-duration nodes", () => {
    expect(() =>
      assertValidNodeRange(
        node("a", "2026-04-25T14:00:00Z", "2026-04-25T14:00:00Z"),
      ),
    ).toThrow();
  });
  it("rejects negative-duration nodes", () => {
    expect(() =>
      assertValidNodeRange(
        node("a", "2026-04-25T14:00:00Z", "2026-04-25T13:00:00Z"),
      ),
    ).toThrow();
  });
});

describe("assertTimelineFeasible", () => {
  it("throws when nodes overlap", () => {
    expect(() =>
      assertTimelineFeasible([
        node("a", "2026-04-25T13:00:00Z", "2026-04-25T14:30:00Z"),
        node("b", "2026-04-25T14:00:00Z", "2026-04-25T15:00:00Z"),
      ]),
    ).toThrow(/RESOURCE_EXHAUSTED/);
  });

  it("passes when nodes do not overlap", () => {
    expect(() =>
      assertTimelineFeasible([
        node("a", "2026-04-25T13:00:00Z", "2026-04-25T14:00:00Z"),
        node("b", "2026-04-25T14:00:00Z", "2026-04-25T15:00:00Z"),
      ]),
    ).not.toThrow();
  });
});
