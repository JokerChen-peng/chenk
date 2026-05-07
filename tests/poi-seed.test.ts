import { describe, expect, it } from "vitest";
import {
  ADCODE_CENTROIDS,
  DEFAULT_HOME_ADCODE,
  distanceKm,
} from "@/src/domain/geo";
import {
  findSeedPoi,
  resolveHomeAnchor,
  SEED_POIS,
} from "@/src/domain/poi-seed";

describe("poi-seed", () => {
  it("has at least 10 POIs across 餐饮 / 亲子 / 展览 / 户外", () => {
    expect(SEED_POIS.length).toBeGreaterThanOrEqual(10);
    const cats = new Set(SEED_POIS.map((p) => p.category));
    expect(cats.has("餐饮")).toBe(true);
    expect(cats.has("亲子")).toBe(true);
    expect(cats.has("展览")).toBe(true);
    expect(cats.has("户外")).toBe(true);
  });

  it("findSeedPoi returns null on miss", () => {
    expect(findSeedPoi("does-not-exist")).toBeNull();
    expect(findSeedPoi(SEED_POIS[0]!.poi_id)?.name).toBe(SEED_POIS[0]!.name);
  });

  it("distanceKm is symmetric and 0 for the same point", () => {
    const a = SEED_POIS[0]!;
    const b = SEED_POIS[1]!;
    expect(distanceKm({ lat: a.lat, lng: a.lng }, { lat: a.lat, lng: a.lng })).toBe(0);
    const ab = distanceKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
    const ba = distanceKm({ lat: b.lat, lng: b.lng }, { lat: a.lat, lng: a.lng });
    expect(ab).toBeGreaterThan(0);
    expect(ab).toBeCloseTo(ba, 2);
  });

  it("resolveHomeAnchor falls back to default adcode when none given", () => {
    const home = resolveHomeAnchor({});
    expect(home.label).toBe(ADCODE_CENTROIDS[DEFAULT_HOME_ADCODE]!.name);
  });

  it("resolveHomeAnchor prefers home_poi_id over adcode", () => {
    const p = SEED_POIS.find((x) => x.adcode !== DEFAULT_HOME_ADCODE)!;
    const home = resolveHomeAnchor({ home_poi_id: p.poi_id });
    expect(home.lat).toBeCloseTo(p.lat, 4);
    expect(home.lng).toBeCloseTo(p.lng, 4);
  });
});
