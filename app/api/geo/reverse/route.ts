import { NextResponse } from "next/server";
import { amapReverseGeocode, isAmapEnabled } from "@/lib/geo/amap-client";
import {
  ADCODE_CENTROIDS,
  isInChinaBoundingBox,
} from "@/src/domain/geo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Demo 仅覆盖上海主城几个区，离最近的区超过这个公里数就视为"不在覆盖范围内"。 */
const SHANGHAI_COVERAGE_MAX_KM = 80;

function nearestCentroid(args: { lat: number; lng: number }): {
  adcode: string;
  district: string;
  distance_km: number;
} {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  let bestAd = "310106";
  let bestName = "静安区";
  let bestKm = Number.POSITIVE_INFINITY;
  for (const [ad, c] of Object.entries(ADCODE_CENTROIDS)) {
    const dLat = toRad(c.lat - args.lat);
    const dLng = toRad(c.lng - args.lng);
    const lat1 = toRad(args.lat);
    const lat2 = toRad(c.lat);
    const x =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const km = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    if (km < bestKm) {
      bestAd = ad;
      bestName = c.name;
      bestKm = km;
    }
  }
  return { adcode: bestAd, district: bestName, distance_km: bestKm };
}

function outOfCoverageResponse(
  lat: number,
  lng: number,
  reason: "outside_china" | "outside_shanghai_demo",
) {
  const message =
    reason === "outside_china"
      ? "你当前的位置看起来在中国大陆范围之外（Demo 仅模拟上海本地数据），请在右侧手动选择上海的一个区作为「家」。"
      : "你当前位置不在 Demo 的上海覆盖范围（仅支持上海主城 6 个区），请手动选择一个区作为「家」。";
  return NextResponse.json({
    adcode: null,
    district: null,
    source: "out_of_coverage",
    reason,
    formatted_address: "",
    message,
    coords: { lat, lng },
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "missing_body" }, { status: 400 });
  }
  const { lat, lng } = body as { lat?: unknown; lng?: unknown };
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return NextResponse.json(
      { error: "lat_lng_required" },
      { status: 400 },
    );
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      { error: "lat_lng_out_of_range" },
      { status: 400 },
    );
  }

  if (!isInChinaBoundingBox(lat, lng)) {
    return outOfCoverageResponse(lat, lng, "outside_china");
  }

  if (isAmapEnabled()) {
    const real = await amapReverseGeocode({ lat, lng });
    if (real) {
      return NextResponse.json({
        adcode: real.adcode,
        district: real.district || real.city || real.province,
        source: "amap",
        formatted_address: real.formatted_address,
      });
    }
  }

  const fallback = nearestCentroid({ lat, lng });
  if (fallback.distance_km > SHANGHAI_COVERAGE_MAX_KM) {
    return outOfCoverageResponse(lat, lng, "outside_shanghai_demo");
  }
  return NextResponse.json({
    adcode: fallback.adcode,
    district: fallback.district,
    source: "centroid_fallback",
    formatted_address: "",
    distance_km: Math.round(fallback.distance_km * 10) / 10,
  });
}
