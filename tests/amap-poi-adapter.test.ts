import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetAmapPoiRegistryForTests,
  amapPoiToVirtualSeed,
  isAmapPoiId,
  lookupAmapPoi,
  rememberAmapPoi,
} from "@/lib/geo/amap-poi-adapter";

beforeEach(() => {
  __resetAmapPoiRegistryForTests();
});

afterEach(() => {
  __resetAmapPoiRegistryForTests();
});

describe("amapPoiToVirtualSeed", () => {
  it("亲子餐厅: 子类 / tag / 餐饮均价", () => {
    const out = amapPoiToVirtualSeed({
      external_amap_id: "B1",
      name: "X 亲子餐厅",
      category_top: "餐饮服务",
      category_path: "餐饮服务;中餐厅;亲子餐厅",
      adcode: "310106",
      district: "静安区",
      lat: 31.224,
      lng: 121.46,
      avg_per_person_cny: null,
      rating: 4.5,
      address: "",
    });
    expect(out).not.toBeNull();
    expect(out!.poi_id).toBe("amap:B1");
    expect(out!.subcategory).toBe("亲子餐厅");
    expect(out!.category).toBe("餐饮");
    expect(out!.tags).toEqual(expect.arrayContaining(["kid_friendly", "indoor"]));
    expect(out!.avg_per_person_cny).toBeGreaterThan(0);
    expect(out!.reservation_supported).toBe(true);
  });

  it("公园: 户外 + outdoor_seat", () => {
    const out = amapPoiToVirtualSeed({
      external_amap_id: "B2",
      name: "复兴公园",
      category_top: "风景名胜",
      category_path: "风景名胜;公园广场;公园",
      adcode: "310101",
      district: "黄浦区",
      lat: 31.221,
      lng: 121.474,
      avg_per_person_cny: null,
      rating: null,
      address: "",
    });
    expect(out).not.toBeNull();
    expect(out!.category).toBe("户外");
    expect(out!.subcategory).toBe("城市公园");
    expect(out!.avg_per_person_cny).toBe(0);
    expect(out!.tags).toEqual(
      expect.arrayContaining(["outdoor_seat", "photogenic", "kid_friendly"]),
    );
    expect(out!.rating).toBeGreaterThan(0); // 缺评分时给默认 4.3
  });

  it("酒吧: 夜生活 + indoor + couple_friendly", () => {
    const out = amapPoiToVirtualSeed({
      external_amap_id: "B3",
      name: "Y 酒吧",
      category_top: "餐饮服务",
      category_path: "餐饮服务;酒吧;酒吧",
      adcode: "310106",
      district: "静安区",
      lat: 31.219,
      lng: 121.454,
      avg_per_person_cny: null,
      rating: 4.6,
      address: "",
    });
    expect(out).not.toBeNull();
    expect(out!.category).toBe("夜生活");
    expect(out!.subcategory).toBe("酒吧");
    expect(out!.tags).toEqual(
      expect.arrayContaining(["indoor", "couple_friendly", "quiet"]),
    );
  });

  it("高档餐厅 (米其林) 单价上调", () => {
    const out = amapPoiToVirtualSeed({
      external_amap_id: "B4",
      name: "米其林三星 X",
      category_top: "餐饮服务",
      category_path: "餐饮服务;西餐厅;法国菜",
      adcode: "310106",
      district: "静安区",
      lat: 31.22,
      lng: 121.45,
      avg_per_person_cny: null,
      rating: 4.9,
      address: "",
    });
    expect(out).not.toBeNull();
    expect(out!.subcategory).toBe("西餐");
    expect(out!.avg_per_person_cny).toBeGreaterThan(150);
  });

  it("非目标 POI（鲜花速递 / 购物服务）应被丢弃，不被强行扣到「餐饮」", () => {
    const flower = amapPoiToVirtualSeed({
      external_amap_id: "F1",
      name: "野兽派鲜花同城速递",
      category_top: "购物服务",
      category_path: "购物服务;鲜花礼品;鲜花店",
      adcode: "310106",
      district: "静安区",
      lat: 31.22,
      lng: 121.45,
      avg_per_person_cny: null,
      rating: 4.8,
      address: "",
    });
    expect(flower).toBeNull();

    const conv = amapPoiToVirtualSeed({
      external_amap_id: "F2",
      name: "便利蜂",
      category_top: "购物服务",
      category_path: "购物服务;便民商店/便利店;便利店",
      adcode: "310106",
      district: "静安区",
      lat: 31.22,
      lng: 121.45,
      avg_per_person_cny: null,
      rating: 4.0,
      address: "",
    });
    expect(conv).toBeNull();

    const gas = amapPoiToVirtualSeed({
      external_amap_id: "F3",
      name: "中石化加油站",
      category_top: "汽车服务",
      category_path: "汽车服务;加油站;加油站",
      adcode: "310106",
      district: "静安区",
      lat: 31.22,
      lng: 121.45,
      avg_per_person_cny: null,
      rating: 0,
      address: "",
    });
    expect(gas).toBeNull();
  });
});

describe("amap registry", () => {
  it("isAmapPoiId 识别前缀", () => {
    expect(isAmapPoiId("amap:B0FFG")).toBe(true);
    expect(isAmapPoiId("rest-jingan-001")).toBe(false);
  });

  it("rememberAmapPoi + lookupAmapPoi 往返", () => {
    const seed = amapPoiToVirtualSeed({
      external_amap_id: "B5",
      name: "Z",
      category_top: "餐饮服务",
      category_path: "餐饮服务;咖啡厅;咖啡厅",
      adcode: "310106",
      district: "静安区",
      lat: 31.22,
      lng: 121.45,
      avg_per_person_cny: null,
      rating: 4.4,
      address: "",
    });
    expect(seed).not.toBeNull();
    rememberAmapPoi(seed!);
    expect(lookupAmapPoi("amap:B5")?.name).toBe("Z");
    expect(lookupAmapPoi("amap:NOPE")).toBeNull();
    expect(lookupAmapPoi("rest-jingan-001")).toBeNull();
  });

  it("非 amap: 前缀的 SeedPoi 不会被 remember 进 registry", () => {
    rememberAmapPoi({
      poi_id: "rest-jingan-001",
      name: "X",
      category: "餐饮",
      subcategory: "中餐",
      adcode: "310106",
      district: "静安区",
      lat: 31.22,
      lng: 121.45,
      tags: [],
      avg_per_person_cny: 100,
      rating: 4.4,
      reservation_supported: true,
      open_hours: [{ open: "10:00", close: "22:00" }],
    });
    expect(lookupAmapPoi("rest-jingan-001")).toBeNull();
  });
});
