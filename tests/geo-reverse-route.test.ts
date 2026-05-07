import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIG_AMAP_KEY = process.env.AMAP_KEY;
const ORIG_MOCK_AGENT = process.env.MOCK_AGENT;

beforeEach(() => {
  vi.resetModules();
  delete process.env.AMAP_KEY;
  delete process.env.MOCK_AGENT;
});

afterEach(() => {
  if (ORIG_AMAP_KEY === undefined) delete process.env.AMAP_KEY;
  else process.env.AMAP_KEY = ORIG_AMAP_KEY;
  if (ORIG_MOCK_AGENT === undefined) delete process.env.MOCK_AGENT;
  else process.env.MOCK_AGENT = ORIG_MOCK_AGENT;
});

function makeReq(body: unknown): Request {
  return {
    json: async () => body,
  } as unknown as Request;
}

async function callRoute(body: unknown) {
  const mod = await import("@/app/api/geo/reverse/route");
  const res = await mod.POST(makeReq(body));
  return (await res.json()) as Record<string, unknown>;
}

describe("/api/geo/reverse", () => {
  it("returns 400 on invalid lat/lng", async () => {
    const data = await callRoute({});
    expect(data.error).toBeTruthy();
  });

  it("rejects coordinates clearly outside China bounding box (Tokyo)", async () => {
    const data = await callRoute({ lat: 35.6812, lng: 139.7671 });
    expect(data.source).toBe("out_of_coverage");
    expect(data.reason).toBe("outside_china");
    expect(data.adcode).toBeNull();
    expect(typeof data.message).toBe("string");
  });

  it("rejects Osaka coordinates (just past 135°E)", async () => {
    const data = await callRoute({ lat: 34.6937, lng: 135.5023 });
    expect(data.source).toBe("out_of_coverage");
    expect(data.reason).toBe("outside_china");
  });

  it("rejects coordinates inside China but far from Shanghai (Beijing)", async () => {
    const data = await callRoute({ lat: 39.9042, lng: 116.4074 });
    expect(data.source).toBe("out_of_coverage");
    expect(data.reason).toBe("outside_shanghai_demo");
  });

  it("returns nearest centroid for Shanghai-area coords (Pudong)", async () => {
    const data = await callRoute({ lat: 31.2226, lng: 121.544 });
    expect(data.source).toBe("centroid_fallback");
    expect(data.adcode).toBe("310115");
    expect(data.district).toBe("浦东新区");
    expect(typeof data.distance_km).toBe("number");
  });

  it("returns nearest centroid for Jingan", async () => {
    const data = await callRoute({ lat: 31.2235, lng: 121.4574 });
    expect(data.source).toBe("centroid_fallback");
    expect(data.adcode).toBe("310106");
  });
});
