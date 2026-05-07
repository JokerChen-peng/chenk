/**
 * 通用地理工具：Haversine 距离 + 上海主城几个 adcode centroid + home anchor 解析。
 * 这些都是纯函数，不依赖 Mastra / Next，可以在工具、API 路由、测试里随便用。
 */

/** Adcode → 区中心点（粗略，用于无 home_poi 时的中心退化）. */
export const ADCODE_CENTROIDS: Record<
  string,
  { lat: number; lng: number; name: string }
> = {
  "310106": { lat: 31.2235, lng: 121.4574, name: "静安区" },
  "310101": { lat: 31.2304, lng: 121.4737, name: "黄浦区" },
  "310104": { lat: 31.1932, lng: 121.4365, name: "徐汇区" },
  "310105": { lat: 31.2207, lng: 121.429, name: "长宁区" },
  "310109": { lat: 31.2659, lng: 121.5008, name: "虹口区" },
  "310115": { lat: 31.2226, lng: 121.544, name: "浦东新区" },
};

/** 默认演示 home：静安区中心. 若 parse 给出别的 adcode，会落到对应 centroid. */
export const DEFAULT_HOME_ADCODE = "310106";

/** Haversine 距离（km），输入纬经度. 结果四舍五入到 2 位小数 */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return Number((R * c).toFixed(2));
}

/** 中国大陆粗略包围盒（含港澳台）；用来挡国外坐标做 fallback 用 */
export const CHINA_BBOX = { latMin: 18, latMax: 54, lngMin: 73, lngMax: 135 };

export function isInChinaBoundingBox(lat: number, lng: number): boolean {
  return (
    lat >= CHINA_BBOX.latMin &&
    lat <= CHINA_BBOX.latMax &&
    lng >= CHINA_BBOX.lngMin &&
    lng <= CHINA_BBOX.lngMax
  );
}

/**
 * 取 home anchor 的经纬度：优先 home_poi_id（需要在 poi 字典里能查到），
 * 否则 adcode 中心，否则默认静安. resolver 注入 findPoi 以避免循环依赖。
 */
export function resolveHomeAnchorWith(
  findPoi: (poi_id: string) =>
    | { lat: number; lng: number; name: string }
    | null,
  opts: { home_poi_id?: string; home_adcode?: string },
): { lat: number; lng: number; label: string } {
  if (opts.home_poi_id) {
    const p = findPoi(opts.home_poi_id);
    if (p) return { lat: p.lat, lng: p.lng, label: p.name };
  }
  const adcode = opts.home_adcode ?? DEFAULT_HOME_ADCODE;
  const c = ADCODE_CENTROIDS[adcode] ?? ADCODE_CENTROIDS[DEFAULT_HOME_ADCODE]!;
  return { lat: c.lat, lng: c.lng, label: c.name };
}
