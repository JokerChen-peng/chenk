"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { MapPin, Star, Timer, Utensils } from "lucide-react";
import { ToolCard } from "./_shared/tool-card";

type PoiCategory =
  | "餐饮"
  | "展览"
  | "咖啡"
  | "亲子"
  | "夜生活"
  | "户外";

type PoiResult = {
  poi_id: string;
  name: string;
  category: PoiCategory;
  adcode: string;
  /** 全员合计（= avg_per_person_cny × party_size），不是人均 */
  estimated_cost: number;
  /** 人均参考（CNY） */
  avg_per_person_cny: number;
  current_wait_time_minutes: number;
  rating: number;
};

function isPoiResultList(value: unknown): value is PoiResult[] {
  return (
    Array.isArray(value) &&
    value.every(
      (x) =>
        x &&
        typeof x === "object" &&
        "name" in x &&
        typeof (x as PoiResult).name === "string" &&
        typeof (x as PoiResult).avg_per_person_cny === "number",
    )
  );
}

function RadarSkeleton() {
  return (
    <div className="relative my-3 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-muted/40 via-card to-muted/30 p-5 shadow-sm">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at center, transparent 0%, transparent 35%, oklch(0.75 0.12 85 / 0.15) 36%, transparent 55%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-[-50%] origin-center animate-radar-sweep"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, oklch(0.72 0.18 55 / 0.25) 32deg, transparent 64deg)",
        }}
      />
      <div className="relative space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 shrink-0 rounded-full bg-muted/80 ring-2 ring-[#FFC300]/40" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted" />
            <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-muted/70" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-border/40 bg-background/50"
            />
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          正在扫描周边优选商户…
        </p>
      </div>
    </div>
  );
}

function PoiMerchantCard({ poi }: { poi: PoiResult }) {
  const filled = Math.round(poi.rating);
  const isFood =
    poi.category === "餐饮" || poi.category === "咖啡";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-[#FFE08A]/60 bg-gradient-to-br from-[#FFFBF0] via-card to-[#FFF5E0] p-4 shadow-md shadow-[#FFC300]/10 transition hover:border-[#FFC300]/80 hover:shadow-lg dark:border-[#8B6914]/40 dark:from-[#2a2418] dark:via-card dark:to-[#1f1a12] dark:shadow-black/30">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#FFC300]/15 blur-2xl" />
      <div className="relative flex gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#FFC300] to-[#FF9500] text-white shadow-inner">
          {isFood ? (
            <Utensils className="h-7 w-7 opacity-95" aria-hidden />
          ) : (
            <MapPin className="h-7 w-7 opacity-95" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="truncate text-base font-semibold tracking-tight text-foreground">
              {poi.name}
            </h3>
            <span className="shrink-0 rounded-full bg-[#FFF3D6] px-2 py-0.5 text-[11px] font-medium text-[#B8860B] dark:bg-[#3d3510] dark:text-[#FFD966]">
              {poi.category}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-[#E85D4C]" />
              区域 {poi.adcode}
            </span>
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" />
              排队约 {poi.current_wait_time_minutes} 分钟
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div
              className="inline-flex items-center gap-0.5 text-[#FF6B00]"
              aria-label={`评分 ${poi.rating} 分`}
            >
              {Array.from({ length: 5 }, (_, i) => (
                <Star
                  key={i}
                  className={`h-4 w-4 ${
                    i < filled
                      ? "fill-[#FF6B00] text-[#FF6B00]"
                      : "fill-transparent text-muted-foreground/35"
                  }`}
                />
              ))}
              <span className="ml-1 text-sm font-semibold tabular-nums text-foreground">
                {poi.rating.toFixed(1)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground">人均参考</span>
              <p className="text-lg font-bold tabular-nums text-[#E85D4C]">
                ¥{poi.avg_per_person_cny}
              </p>
              {poi.estimated_cost !== poi.avg_per_person_cny ? (
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  全员合计 ¥{poi.estimated_cost}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function SearchEnhancedPoiToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  return (
    <ToolCard<PoiResult[]>
      props={props}
      isExpectedShape={isPoiResultList}
      errorMessage="商户检索失败，请稍后重试。"
      loadingFallback={<RadarSkeleton />}
      incompleteFallback={
        <div className="my-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          商户检索未完成或已中断，请重试。
        </div>
      }
      shapeMismatchFallback={
        <div className="my-3 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          未识别到商户结果数据。
        </div>
      }
      render={(list) => (
        <div className="my-3 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            为你找到 {list.length} 个优选地点
          </p>
          <div className="grid gap-3 sm:grid-cols-1">
            {list.map((poi) => (
              <PoiMerchantCard key={poi.poi_id} poi={poi} />
            ))}
          </div>
        </div>
      )}
    />
  );
}
