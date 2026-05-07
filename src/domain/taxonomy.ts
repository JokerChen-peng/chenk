import { z } from "zod";

/** Top-level coarse category. */
export const poiCategorySchema = z.enum([
  "餐饮",
  "展览",
  "咖啡",
  "亲子",
  "夜生活",
  "户外",
]);
export type PoiCategory = z.infer<typeof poiCategorySchema>;

/** 更细粒度子类，规划时辅助匹配 brief 中「亲子乐园 / 展览 / citywalk 小吃街」等说法 */
export const poiSubcategorySchema = z.enum([
  "中餐",
  "粤菜",
  "本帮菜",
  "西餐",
  "日料",
  "火锅",
  "甜品下午茶",
  "轻食沙拉",
  "亲子餐厅",
  "精品咖啡",
  "连锁咖啡",
  "博物馆",
  "美术馆",
  "互动展",
  "亲子乐园",
  "室内乐园",
  "儿童剧场",
  "城市公园",
  "滨江步道",
  "citywalk_food_street",
  "夜市",
  "live_house",
  "酒吧",
]);
export type PoiSubcategory = z.infer<typeof poiSubcategorySchema>;

/** POI 标签：规划时按 dietary / accessibility / scene 软过滤. */
export const poiTagSchema = z.enum([
  "kid_friendly",
  "low_cal",
  "vegetarian_options",
  "wheelchair_accessible",
  "outdoor_seat",
  "indoor",
  "quiet",
  "photogenic",
  "couple_friendly",
  "group_friendly",
  "wifi",
  "stroller_friendly",
  "no_reservation_needed",
  "supports_group_buy",
  "supports_meituan_pay",
]);
export type PoiTag = z.infer<typeof poiTagSchema>;

/** 用户偏好硬过滤的子集：parse_outing_constraints 输出的 dietary_notes 用同一组语义. */
export const dietaryFilterSchema = z.enum([
  "kid_friendly",
  "low_cal",
  "vegetarian_options",
  "wheelchair_accessible",
]);
export type DietaryFilter = z.infer<typeof dietaryFilterSchema>;

export const sceneSchema = z.enum(["family", "friends", "solo", "unknown"]);
export type Scene = z.infer<typeof sceneSchema>;
