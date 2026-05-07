import type { PoiCategory, PoiSubcategory, PoiTag } from "./taxonomy";
import { resolveHomeAnchorWith } from "./geo";

/**
 * 虚构 POI 种子库（Demo only，不是真实美团数据）。
 *
 * - 经纬度均为「上海市内合理范围」的随机虚构值；只用于估算距离。
 * - lat/lng 同时被 calculate_transit_matrix / validate_geo_envelope 使用。
 */
export type SeedPoi = {
  poi_id: string;
  name: string;
  category: PoiCategory;
  subcategory: PoiSubcategory;
  adcode: string;
  district: string;
  lat: number;
  lng: number;
  tags: PoiTag[];
  avg_per_person_cny: number;
  rating: number;
  reservation_supported: boolean;
  open_hours: { open: string; close: string }[];
  group_buy_deals?: {
    deal_id: string;
    title: string;
    original_cny: number;
    deal_cny: number;
  }[];
};

export const SEED_POIS: SeedPoi[] = [
  {
    poi_id: "rest-jingan-001",
    name: "静安·绿光森林亲子餐厅",
    category: "餐饮",
    subcategory: "亲子餐厅",
    adcode: "310106",
    district: "静安区",
    lat: 31.2241,
    lng: 121.4602,
    tags: [
      "kid_friendly",
      "low_cal",
      "stroller_friendly",
      "indoor",
      "supports_group_buy",
      "supports_meituan_pay",
    ],
    avg_per_person_cny: 128,
    rating: 4.6,
    reservation_supported: true,
    open_hours: [{ open: "10:30", close: "22:00" }],
    group_buy_deals: [
      {
        deal_id: "deal-jingan-001",
        title: "二大一小亲子套餐",
        original_cny: 388,
        deal_cny: 268,
      },
    ],
  },
  {
    poi_id: "rest-jingan-002",
    name: "静安·轻盐沙拉工坊",
    category: "餐饮",
    subcategory: "轻食沙拉",
    adcode: "310106",
    district: "静安区",
    lat: 31.2256,
    lng: 121.4521,
    tags: [
      "low_cal",
      "vegetarian_options",
      "indoor",
      "wifi",
      "supports_meituan_pay",
    ],
    avg_per_person_cny: 78,
    rating: 4.4,
    reservation_supported: true,
    open_hours: [{ open: "10:00", close: "21:30" }],
  },
  {
    poi_id: "rest-jingan-003",
    name: "静安·小南国本帮家宴",
    category: "餐饮",
    subcategory: "本帮菜",
    adcode: "310106",
    district: "静安区",
    lat: 31.227,
    lng: 121.453,
    tags: [
      "group_friendly",
      "kid_friendly",
      "indoor",
      "supports_group_buy",
      "supports_meituan_pay",
    ],
    avg_per_person_cny: 168,
    rating: 4.5,
    reservation_supported: true,
    open_hours: [{ open: "11:00", close: "21:30" }],
    group_buy_deals: [
      {
        deal_id: "deal-jingan-003",
        title: "四人本帮经典套餐",
        original_cny: 788,
        deal_cny: 588,
      },
    ],
  },
  {
    poi_id: "play-jingan-101",
    name: "静安·星空亲子互动乐园",
    category: "亲子",
    subcategory: "室内乐园",
    adcode: "310106",
    district: "静安区",
    lat: 31.221,
    lng: 121.4598,
    tags: [
      "kid_friendly",
      "indoor",
      "stroller_friendly",
      "wheelchair_accessible",
    ],
    avg_per_person_cny: 98,
    rating: 4.7,
    reservation_supported: true,
    open_hours: [{ open: "09:30", close: "21:00" }],
    group_buy_deals: [
      {
        deal_id: "deal-jingan-101",
        title: "一大一小欢乐畅玩 2h",
        original_cny: 198,
        deal_cny: 138,
      },
    ],
  },
  {
    poi_id: "play-jingan-102",
    name: "静安雕塑公园",
    category: "户外",
    subcategory: "城市公园",
    adcode: "310106",
    district: "静安区",
    lat: 31.2367,
    lng: 121.457,
    tags: [
      "kid_friendly",
      "stroller_friendly",
      "wheelchair_accessible",
      "outdoor_seat",
      "photogenic",
    ],
    avg_per_person_cny: 0,
    rating: 4.6,
    reservation_supported: false,
    open_hours: [{ open: "06:00", close: "22:00" }],
  },
  {
    poi_id: "exhibit-jingan-201",
    name: "静安·当代美术馆「光之纪行」特展",
    category: "展览",
    subcategory: "美术馆",
    adcode: "310106",
    district: "静安区",
    lat: 31.2289,
    lng: 121.461,
    tags: ["indoor", "photogenic", "wheelchair_accessible", "couple_friendly"],
    avg_per_person_cny: 88,
    rating: 4.5,
    reservation_supported: true,
    open_hours: [{ open: "10:00", close: "20:00" }],
  },
  {
    poi_id: "exhibit-huangpu-202",
    name: "黄浦·上海博物馆东馆",
    category: "展览",
    subcategory: "博物馆",
    adcode: "310101",
    district: "黄浦区",
    lat: 31.233,
    lng: 121.481,
    tags: ["indoor", "wheelchair_accessible", "kid_friendly", "stroller_friendly"],
    avg_per_person_cny: 0,
    rating: 4.8,
    reservation_supported: true,
    open_hours: [{ open: "09:00", close: "17:00" }],
  },
  {
    poi_id: "cafe-jingan-301",
    name: "静安·M Stand 嘉里中心店",
    category: "咖啡",
    subcategory: "精品咖啡",
    adcode: "310106",
    district: "静安区",
    lat: 31.2249,
    lng: 121.4575,
    tags: [
      "low_cal",
      "wifi",
      "indoor",
      "couple_friendly",
      "supports_meituan_pay",
    ],
    avg_per_person_cny: 52,
    rating: 4.5,
    reservation_supported: false,
    open_hours: [{ open: "08:00", close: "22:30" }],
  },
  {
    poi_id: "cafe-jingan-302",
    name: "静安·MANNER 咖啡乌中市集店",
    category: "咖啡",
    subcategory: "连锁咖啡",
    adcode: "310106",
    district: "静安区",
    lat: 31.2202,
    lng: 121.4498,
    tags: ["low_cal", "indoor", "outdoor_seat", "supports_meituan_pay"],
    avg_per_person_cny: 28,
    rating: 4.4,
    reservation_supported: false,
    open_hours: [{ open: "07:30", close: "20:30" }],
  },
  {
    poi_id: "street-huangpu-401",
    name: "豫园·老城厢小吃街",
    category: "夜生活",
    subcategory: "citywalk_food_street",
    adcode: "310101",
    district: "黄浦区",
    lat: 31.228,
    lng: 121.492,
    tags: [
      "group_friendly",
      "photogenic",
      "outdoor_seat",
      "supports_meituan_pay",
    ],
    avg_per_person_cny: 65,
    rating: 4.3,
    reservation_supported: false,
    open_hours: [{ open: "10:00", close: "22:30" }],
  },
  {
    poi_id: "rest-pudong-501",
    name: "浦东·正大广场海底捞",
    category: "餐饮",
    subcategory: "火锅",
    adcode: "310115",
    district: "浦东新区",
    lat: 31.241,
    lng: 121.5012,
    tags: [
      "group_friendly",
      "kid_friendly",
      "indoor",
      "supports_group_buy",
      "supports_meituan_pay",
    ],
    avg_per_person_cny: 158,
    rating: 4.7,
    reservation_supported: true,
    open_hours: [{ open: "10:30", close: "23:30" }],
    group_buy_deals: [
      {
        deal_id: "deal-pudong-501",
        title: "四人欢享套餐（含锅底+8 菜）",
        original_cny: 868,
        deal_cny: 588,
      },
    ],
  },
  {
    poi_id: "exhibit-pudong-602",
    name: "浦东·teamLab 无相艺术空间",
    category: "展览",
    subcategory: "互动展",
    adcode: "310115",
    district: "浦东新区",
    lat: 31.244,
    lng: 121.498,
    tags: ["indoor", "photogenic", "couple_friendly", "kid_friendly"],
    avg_per_person_cny: 199,
    rating: 4.7,
    reservation_supported: true,
    open_hours: [{ open: "10:00", close: "22:00" }],
  },
  {
    poi_id: "play-pudong-701",
    name: "浦东·世纪公园儿童乐园",
    category: "亲子",
    subcategory: "亲子乐园",
    adcode: "310115",
    district: "浦东新区",
    lat: 31.2178,
    lng: 121.5468,
    tags: ["kid_friendly", "stroller_friendly", "outdoor_seat", "photogenic"],
    avg_per_person_cny: 38,
    rating: 4.5,
    reservation_supported: false,
    open_hours: [{ open: "07:00", close: "18:30" }],
  },
  {
    poi_id: "outdoor-xuhui-801",
    name: "徐汇·西岸滨江骑行道",
    category: "户外",
    subcategory: "滨江步道",
    adcode: "310104",
    district: "徐汇区",
    lat: 31.1865,
    lng: 121.4612,
    tags: [
      "kid_friendly",
      "stroller_friendly",
      "outdoor_seat",
      "photogenic",
      "wheelchair_accessible",
    ],
    avg_per_person_cny: 0,
    rating: 4.7,
    reservation_supported: false,
    open_hours: [{ open: "00:00", close: "23:59" }],
  },
  {
    poi_id: "bar-jingan-901",
    name: "静安·Speak Low 隐藏酒吧",
    category: "夜生活",
    subcategory: "酒吧",
    adcode: "310106",
    district: "静安区",
    lat: 31.2196,
    lng: 121.454,
    tags: ["indoor", "couple_friendly", "quiet"],
    avg_per_person_cny: 220,
    rating: 4.6,
    reservation_supported: true,
    open_hours: [{ open: "19:00", close: "02:00" }],
  },
  {
    poi_id: "gift-jingan-cake-01",
    name: "静安·LeTAO 蛋糕同城配送",
    category: "餐饮",
    subcategory: "甜品下午茶",
    adcode: "310106",
    district: "静安区",
    lat: 31.2255,
    lng: 121.4509,
    tags: ["indoor", "supports_meituan_pay", "photogenic"],
    avg_per_person_cny: 188,
    rating: 4.7,
    reservation_supported: false,
    open_hours: [{ open: "10:00", close: "22:00" }],
  },
  {
    poi_id: "gift-jingan-flower-01",
    name: "静安·野兽派鲜花同城速递",
    category: "餐饮",
    subcategory: "甜品下午茶",
    adcode: "310106",
    district: "静安区",
    lat: 31.2243,
    lng: 121.4513,
    tags: ["indoor", "supports_meituan_pay", "photogenic"],
    avg_per_person_cny: 358,
    rating: 4.8,
    reservation_supported: false,
    open_hours: [{ open: "09:00", close: "22:00" }],
  },
];

/** 通过 poi_id 拿到完整 SeedPoi（找不到时返回 null）. */
export function findSeedPoi(poi_id: string): SeedPoi | null {
  return SEED_POIS.find((p) => p.poi_id === poi_id) ?? null;
}

/** 在 SEED_POIS 上 wire 出 home anchor 解析（需要 lookup 时优先种子库） */
export function resolveHomeAnchor(opts: {
  home_poi_id?: string;
  home_adcode?: string;
}): { lat: number; lng: number; label: string } {
  return resolveHomeAnchorWith((id) => {
    const p = findSeedPoi(id);
    return p ? { lat: p.lat, lng: p.lng, name: p.name } : null;
  }, opts);
}
