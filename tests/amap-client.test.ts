import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetAmapCacheForTests,
  amapDistanceMatrix,
  amapReverseGeocode,
  amapSearchPoi,
  amapWeather,
  categorizeAmapPoi,
  isAmapEnabled,
} from "@/lib/geo/amap-client";

const ORIG_AMAP_KEY = process.env.AMAP_KEY;
const ORIG_MOCK_AGENT = process.env.MOCK_AGENT;

beforeEach(() => {
  __resetAmapCacheForTests();
  process.env.AMAP_KEY = "test-key";
  delete process.env.MOCK_AGENT;
});

afterEach(() => {
  if (ORIG_AMAP_KEY === undefined) delete process.env.AMAP_KEY;
  else process.env.AMAP_KEY = ORIG_AMAP_KEY;
  if (ORIG_MOCK_AGENT === undefined) delete process.env.MOCK_AGENT;
  else process.env.MOCK_AGENT = ORIG_MOCK_AGENT;
});

function jsonRes(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

type FetchMock = (url: string) => Promise<Response>;
function makeFetchMock(impl: FetchMock) {
  return vi.fn(impl);
}

describe("isAmapEnabled", () => {
  it("MOCK_AGENT=1 一律不启用，即使有 key", () => {
    process.env.MOCK_AGENT = "1";
    expect(isAmapEnabled()).toBe(false);
  });
  it("没 key 不启用", () => {
    delete process.env.AMAP_KEY;
    expect(isAmapEnabled()).toBe(false);
  });
  it("空字符串 key 不启用", () => {
    process.env.AMAP_KEY = "   ";
    expect(isAmapEnabled()).toBe(false);
  });
  it("有 key 且非 mock，启用", () => {
    expect(isAmapEnabled()).toBe(true);
  });
});

describe("amapSearchPoi", () => {
  it("返回 null 当未启用", async () => {
    delete process.env.AMAP_KEY;
    const fake = makeFetchMock(async () => jsonRes({}));
    const out = await amapSearchPoi({ keyword: "餐厅" }, fake as never);
    expect(out).toBeNull();
    expect(fake).not.toHaveBeenCalled();
  });

  it("正常解析 v5 响应", async () => {
    const fake = makeFetchMock(async () =>
      jsonRes({
        status: "1",
        pois: [
          {
            id: "B0FFGABC01",
            name: "静安·绿光森林亲子餐厅",
            type: "餐饮服务;中餐厅;亲子餐厅",
            adcode: "310106",
            adname: "静安区",
            location: "121.4602,31.2241",
            address: "南京西路 1234 号",
            business: { rating: "4.6" },
          },
        ],
      }),
    );
    const out = await amapSearchPoi(
      { keyword: "亲子餐厅", adcode: "310106" },
      fake as never,
    );
    expect(out).toEqual([
      expect.objectContaining({
        external_amap_id: "B0FFGABC01",
        name: "静安·绿光森林亲子餐厅",
        category_top: "餐饮服务",
        adcode: "310106",
        district: "静安区",
        lat: 31.2241,
        lng: 121.4602,
        rating: 4.6,
        avg_per_person_cny: null,
      }),
    ]);
    expect(fake).toHaveBeenCalledTimes(1);
    const calledUrl = fake.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("/v5/place/text?");
    expect(calledUrl).toContain("keywords=");
    expect(calledUrl).toContain("region=310106");
    expect(calledUrl).toContain("key=test-key");
  });

  it("HTTP 4xx 返回 null", async () => {
    const fake = makeFetchMock(async () => jsonRes({}, false));
    const out = await amapSearchPoi({ keyword: "x" }, fake as never);
    expect(out).toBeNull();
  });

  it("Amap status=0 返回 null（业务失败也算降级）", async () => {
    const fake = makeFetchMock(async () =>
      jsonRes({ status: "0", info: "INVALID_USER_KEY" }),
    );
    const out = await amapSearchPoi({ keyword: "x" }, fake as never);
    expect(out).toBeNull();
  });

  it("过滤掉缺少 location 或 id 的 POI", async () => {
    const fake = makeFetchMock(async () =>
      jsonRes({
        status: "1",
        pois: [
          { id: "A", name: "OK", type: "餐饮服务;咖啡厅;咖啡厅", location: "121.4,31.2" },
          { id: "B", name: "缺 location", type: "餐饮服务;咖啡厅;咖啡厅" },
          { name: "缺 id", type: "餐饮服务;咖啡厅;咖啡厅", location: "121.4,31.2" },
        ],
      }),
    );
    const out = await amapSearchPoi({ keyword: "k" }, fake as never);
    expect(out).toHaveLength(1);
    expect(out![0]!.external_amap_id).toBe("A");
  });

  it("二次同参调用走缓存（不再请求）", async () => {
    const fake = makeFetchMock(async () =>
      jsonRes({
        status: "1",
        pois: [
          {
            id: "B1",
            name: "X",
            type: "餐饮服务;咖啡厅;咖啡厅",
            location: "121.4,31.2",
            adcode: "310106",
          },
        ],
      }),
    );
    await amapSearchPoi({ keyword: "k", adcode: "310106" }, fake as never);
    await amapSearchPoi({ keyword: "k", adcode: "310106" }, fake as never);
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("fetch 抛错（含超时 abort）返回 null", async () => {
    const fake = makeFetchMock(async () => {
      throw new Error("network");
    });
    const out = await amapSearchPoi({ keyword: "k" }, fake as never);
    expect(out).toBeNull();
  });
});

describe("amapDistanceMatrix", () => {
  it("解析 v3 distance 响应", async () => {
    const fake = makeFetchMock(async () =>
      jsonRes({
        status: "1",
        results: [
          { distance: "1234", duration: "300" },
          { distance: "8000", duration: "1200" },
        ],
      }),
    );
    const out = await amapDistanceMatrix(
      {
        origin: { lat: 31.2235, lng: 121.4574 },
        destinations: [
          { lat: 31.224, lng: 121.4602 },
          { lat: 31.241, lng: 121.5012 },
        ],
        type: 1,
      },
      fake as never,
    );
    expect(out).toEqual([
      { distance_m: 1234, duration_s: 300 },
      { distance_m: 8000, duration_s: 1200 },
    ]);
    const url = fake.mock.calls[0]![0] as string;
    expect(url).toContain("/v3/distance?");
    expect(url).toContain(
      "destination=121.4602%2C31.224%7C121.5012%2C31.241",
    );
  });

  it("destinations 数 != results 数返回 null", async () => {
    const fake = makeFetchMock(async () =>
      jsonRes({ status: "1", results: [{ distance: "1", duration: "1" }] }),
    );
    const out = await amapDistanceMatrix(
      {
        origin: { lat: 31, lng: 121 },
        destinations: [
          { lat: 31, lng: 121 },
          { lat: 31, lng: 121 },
        ],
      },
      fake as never,
    );
    expect(out).toBeNull();
  });
});

describe("amapReverseGeocode", () => {
  it("解析 regeocode 响应", async () => {
    const fake = makeFetchMock(async () =>
      jsonRes({
        status: "1",
        regeocode: {
          formatted_address: "上海市静安区南京西路 1234 号",
          addressComponent: {
            adcode: "310106",
            province: "上海市",
            city: "上海市",
            district: "静安区",
          },
        },
      }),
    );
    const out = await amapReverseGeocode(
      { lat: 31.2235, lng: 121.4574 },
      fake as never,
    );
    expect(out?.adcode).toBe("310106");
    expect(out?.district).toBe("静安区");
  });

  it("非法 adcode 返回 null", async () => {
    const fake = makeFetchMock(async () =>
      jsonRes({
        status: "1",
        regeocode: { addressComponent: { adcode: "abc" } },
      }),
    );
    const out = await amapReverseGeocode(
      { lat: 31, lng: 121 },
      fake as never,
    );
    expect(out).toBeNull();
  });
});

describe("amapWeather", () => {
  it("从 forecast 选中给定日期并合成 24 条 hourly", async () => {
    const fake = makeFetchMock(async () =>
      jsonRes({
        status: "1",
        forecasts: [
          {
            casts: [
              {
                date: "2026-05-02",
                dayweather: "中雨",
                nightweather: "多云",
                daytemp: "18",
                nighttemp: "12",
              },
              {
                date: "2026-05-03",
                dayweather: "晴",
                nightweather: "晴",
                daytemp: "22",
                nighttemp: "13",
              },
            ],
          },
        ],
      }),
    );
    const out = await amapWeather(
      { adcode: "310106", date: "2026-05-02" },
      fake as never,
    );
    expect(out?.high_temp_c).toBe(18);
    expect(out?.low_temp_c).toBe(12);
    expect(out?.hourly).toHaveLength(24);
    // 14 点白天，应该是 light_rain（中雨）
    const noon = out!.hourly!.find((h) => h.hour === 14);
    expect(noon?.condition).toBe("light_rain");
    // 凌晨 3 点夜间多云
    const night = out!.hourly!.find((h) => h.hour === 3);
    expect(night?.condition).toBe("cloudy");
  });

  it("找不到 date 返回 null", async () => {
    const fake = makeFetchMock(async () =>
      jsonRes({
        status: "1",
        forecasts: [
          {
            casts: [{ date: "2099-01-01", daytemp: "20", nighttemp: "10" }],
          },
        ],
      }),
    );
    const out = await amapWeather(
      { adcode: "310106", date: "2026-05-02" },
      fake as never,
    );
    expect(out).toBeNull();
  });
});

describe("categorizeAmapPoi", () => {
  it("餐饮服务 → 餐饮", () => {
    expect(categorizeAmapPoi("050000", "餐饮服务;中餐厅;江浙菜")).toBe("餐饮");
  });
  it("咖啡 → 咖啡", () => {
    expect(categorizeAmapPoi("050500", "餐饮服务;咖啡厅;咖啡厅")).toBe("咖啡");
  });
  it("酒吧 → 夜生活", () => {
    expect(categorizeAmapPoi("050800", "餐饮服务;酒吧;酒吧")).toBe("夜生活");
  });
  it("博物馆 → 展览", () => {
    expect(categorizeAmapPoi("140100", "科教文化服务;博物馆;博物馆")).toBe(
      "展览",
    );
  });
});
