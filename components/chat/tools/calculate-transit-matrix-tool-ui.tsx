"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { ArrowRight, Bike, Bus, Car, Footprints, Timer } from "lucide-react";
import { ToolCard } from "./_shared/tool-card";

type TransitMode = "walking" | "driving" | "transit" | "cycling";

type TransitResult = {
  origin_poi_id: string;
  destination_poi_id: string;
  estimated_duration_minutes: number;
  mode: TransitMode;
  distance_km: number;
};

function isTransitResult(v: unknown): v is TransitResult {
  return (
    !!v &&
    typeof v === "object" &&
    "origin_poi_id" in v &&
    "destination_poi_id" in v &&
    "estimated_duration_minutes" in v
  );
}

const modeMeta: Record<
  TransitMode,
  { label: string; Icon: typeof Footprints; color: string }
> = {
  walking: { label: "步行", Icon: Footprints, color: "text-emerald-600" },
  driving: { label: "驾车", Icon: Car, color: "text-blue-600" },
  transit: { label: "公共交通", Icon: Bus, color: "text-violet-600" },
  cycling: { label: "骑行", Icon: Bike, color: "text-amber-600" },
};

function TransitCard({ r }: { r: TransitResult }) {
  const meta = modeMeta[r.mode] ?? modeMeta.walking;
  const Icon = meta.Icon;
  return (
    <div className="my-3 rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.06]">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="max-w-[42%] truncate font-mono text-xs text-muted-foreground">
          {r.origin_poi_id}
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-[#FFC300]" />
        <span className="max-w-[42%] truncate font-mono text-xs text-muted-foreground">
          {r.destination_poi_id}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl bg-muted ${meta.color}`}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">出行方式</p>
            <p className="text-lg font-semibold">{meta.label}</p>
          </div>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Timer className="h-3.5 w-3.5" />
              预计用时
            </p>
            <p className="text-xl font-bold tabular-nums text-foreground">
              {r.estimated_duration_minutes}
              <span className="text-sm font-normal text-muted-foreground"> 分钟</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">距离（模拟）</p>
            <p className="text-xl font-bold tabular-nums text-[#E85D4C]">
              {r.distance_km}
              <span className="text-sm font-normal text-muted-foreground"> km</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CalculateTransitMatrixToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  return (
    <ToolCard<TransitResult>
      props={props}
      isExpectedShape={isTransitResult}
      errorMessage="路程估算失败。"
      loadingFallback={
        <div className="my-3 flex items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          <span className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          正在估算路程…
        </div>
      }
      render={(r) => <TransitCard r={r} />}
    />
  );
}
