import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchEnhancedPoiTool } from "@/src/mastra/tools/discover/search-enhanced-poi";
import {
  __resetAmapCacheForTests,
  isAmapEnabled,
} from "@/lib/geo/amap-client";
import { __resetAmapPoiRegistryForTests } from "@/lib/geo/amap-poi-adapter";
import { RequestContext } from "@mastra/core/di";
import type { ToolExecutionContext } from "@mastra/core/tools";

const ORIG_AMAP_KEY = process.env.AMAP_KEY;
const ORIG_MOCK_AGENT = process.env.MOCK_AGENT;

function makeCtx(): ToolExecutionContext<unknown, unknown, unknown> {
  return {
    requestContext: new RequestContext(),
  } as unknown as ToolExecutionContext<unknown, unknown, unknown>;
}

type Result = Array<{
  poi_id: string;
  name: string;
  match_reasons: string[];
}>;

async function runSearch(
  input: Parameters<NonNullable<typeof searchEnhancedPoiTool.execute>>[0],
): Promise<Result> {
  const exec = searchEnhancedPoiTool.execute;
  if (!exec) throw new Error("searchEnhancedPoiTool.execute missing");
  const out = await exec(input, makeCtx());
  return out as unknown as Result;
}

beforeEach(() => {
  __resetAmapCacheForTests();
  __resetAmapPoiRegistryForTests();
  delete process.env.AMAP_KEY;
  delete process.env.MOCK_AGENT;
  vi.restoreAllMocks();
});

afterEach(() => {
  if (ORIG_AMAP_KEY === undefined) delete process.env.AMAP_KEY;
  else process.env.AMAP_KEY = ORIG_AMAP_KEY;
  if (ORIG_MOCK_AGENT === undefined) delete process.env.MOCK_AGENT;
  else process.env.MOCK_AGENT = ORIG_MOCK_AGENT;
});

const baseInput = {
  adcode_boundary: "310106",
  category_matrix: ["餐饮", "亲子"] as ("餐饮" | "亲子")[],
  budget_constraint: 200,
  party_size: 3,
  scene: "family" as const,
  max_travel_km_from_home: 15,
};

describe("search_enhanced_poi · 离线 fallback", () => {
  it("没 AMAP_KEY 时纯 seed 数据，结果都不带 amap: 前缀", async () => {
    expect(isAmapEnabled()).toBe(false);
    const out = await runSearch(baseInput);
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) {
      expect(r.poi_id.startsWith("amap:")).toBe(false);
    }
  });

  it("MOCK_AGENT=1 即使有 KEY 也不调 Amap", async () => {
    process.env.AMAP_KEY = "test-key";
    process.env.MOCK_AGENT = "1";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({} as never);
    await runSearch(baseInput);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("search_enhanced_poi · 接 Amap 时 happy path", () => {
  it("Amap 返回的 POI 出现在结果首位（带 amap: 前缀）且匹配理由含「高德实时」", async () => {
    process.env.AMAP_KEY = "test-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url) => {
        const u = String(url);
        if (u.includes("/v5/place/text")) {
          if (u.includes("keywords=%E9%A4%90%E5%8E%85")) {
            return {
              ok: true,
              json: async () => ({
                status: "1",
                pois: [
                  {
                    id: "REAL-REST-1",
                    name: "高德真餐厅",
                    type: "餐饮服务;中餐厅;亲子餐厅",
                    adcode: "310106",
                    adname: "静安区",
                    location: "121.4602,31.2241",
                    business: { rating: "4.8" },
                  },
                ],
              }),
            } as unknown as Response;
          }
          return {
            ok: true,
            json: async () => ({ status: "1", pois: [] }),
          } as unknown as Response;
        }
        return { ok: false, json: async () => ({}) } as unknown as Response;
      });

    const out = await runSearch(baseInput);
    expect(fetchSpy).toHaveBeenCalled();
    const top = out[0]!;
    expect(top.poi_id).toBe("amap:REAL-REST-1");
    expect(top.name).toBe("高德真餐厅");
    expect(top.match_reasons[0]).toContain("高德实时");
  });

  it("Amap 全部失败时回退 seed", async () => {
    process.env.AMAP_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as unknown as Response);
    const out = await runSearch(baseInput);
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) {
      expect(r.poi_id.startsWith("amap:")).toBe(false);
    }
  });
});
