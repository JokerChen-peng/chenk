"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import {
  Bus,
  CircleDot,
  Coffee,
  ExternalLink,
  MapPin,
  MoreHorizontal,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ToolCard } from "./_shared/tool-card";

type SegmentKind = "play" | "meal" | "transit" | "buffer" | "other";

type Segment = {
  segment_id: string;
  kind: SegmentKind;
  label: string;
  poi_id?: string;
  start_time_iso: string;
  end_time_iso: string;
  estimated_cost_cny?: number;
  notes?: string;
};

type ItineraryResult = {
  itinerary_id: string;
  title: string;
  segment_count: number;
  segments: Segment[];
  total_estimated_cost_cny?: number;
  budget_total_cny?: number;
  budget_status?: "ok" | "tight" | "over_budget" | "unknown";
  validation: "passed";
};

function isItineraryResult(v: unknown): v is ItineraryResult {
  return (
    !!v &&
    typeof v === "object" &&
    "itinerary_id" in v &&
    "segments" in v &&
    Array.isArray((v as ItineraryResult).segments)
  );
}

const kindStyle: Record<
  SegmentKind,
  { label: string; borderAccent: string; Icon: typeof MapPin }
> = {
  play: { label: "游玩", borderAccent: "border-l-sky-500", Icon: CircleDot },
  meal: { label: "用餐", borderAccent: "border-l-[#FF6B00]", Icon: Utensils },
  transit: { label: "交通", borderAccent: "border-l-slate-400", Icon: Bus },
  buffer: { label: "缓冲", borderAccent: "border-l-amber-400", Icon: MoreHorizontal },
  other: { label: "其它", borderAccent: "border-l-muted-foreground", Icon: MapPin },
};

function formatRange(startIso: string, endIso: string) {
  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const tf = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${tf.format(s)} – ${tf.format(e)}`;
  } catch {
    return `${startIso} – ${endIso}`;
  }
}

function budgetTone(s: ItineraryResult["budget_status"]): {
  bar: string;
  label: string;
  text: string;
} {
  switch (s) {
    case "ok":
      return {
        bar: "bg-gradient-to-r from-emerald-500 to-emerald-400",
        label: "预算充裕",
        text: "text-emerald-700 dark:text-emerald-300",
      };
    case "tight":
      return {
        bar: "bg-gradient-to-r from-[#FFC300] to-[#FF9500]",
        label: "贴近预算",
        text: "text-[#8B5A00] dark:text-[#FFD966]",
      };
    case "over_budget":
      return {
        bar: "bg-gradient-to-r from-red-500 to-red-400",
        label: "超出预算",
        text: "text-red-700 dark:text-red-300",
      };
    default:
      return {
        bar: "bg-foreground/40",
        label: "未设预算",
        text: "text-muted-foreground",
      };
  }
}

function BudgetBar({ r }: { r: ItineraryResult }) {
  const total = r.total_estimated_cost_cny ?? 0;
  const budget = r.budget_total_cny;
  if (!budget && total <= 0) return null;
  const ratio = budget && budget > 0 ? Math.min(1.4, total / budget) : 0;
  const tone = budgetTone(r.budget_status);
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return (
    <div className="border-t border-border/40 bg-muted/15 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-muted-foreground">行程预估总价</span>
        <span className="font-mono tabular-nums text-foreground">
          ¥{total}
          {budget ? (
            <span className="text-muted-foreground"> / ¥{budget}</span>
          ) : null}
        </span>
      </div>
      {budget ? (
        <>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/50">
            <div
              className={`h-full rounded-full transition-all ${tone.bar}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className={tone.text}>{tone.label}</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {pct}%
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ItineraryCard({ r }: { r: ItineraryResult }) {
  const [persistState, setPersistState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const lastPersistedId = useRef<string | null>(null);

  const retrySave = useCallback(() => {
    lastPersistedId.current = null;
    setPersistState("saving");
    void (async () => {
      try {
        const res = await fetch("/api/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: r.itinerary_id,
            title: r.title,
            segments: r.segments,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        lastPersistedId.current = r.itinerary_id;
        setPersistState("saved");
      } catch {
        lastPersistedId.current = null;
        setPersistState("error");
      }
    })();
  }, [r]);

  useEffect(() => {
    const id = r.itinerary_id;
    if (lastPersistedId.current === id) return;
    let cancelled = false;
    setPersistState("saving");
    void (async () => {
      try {
        const res = await fetch("/api/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: r.itinerary_id,
            title: r.title,
            segments: r.segments,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        if (!cancelled) {
          lastPersistedId.current = id;
          setPersistState("saved");
        }
      } catch {
        if (!cancelled) setPersistState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [r]);

  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-[#FFD699]/60 bg-gradient-to-b from-card to-[#FFFCF7] shadow-md dark:border-[#6b5420]/40 dark:from-card dark:to-[#1c1812]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#FFC300]/20 bg-[#FFC300]/12 px-4 py-3 dark:bg-[#FFC300]/8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#8B5A00] dark:text-[#FFD966]">
            已定稿行程
          </p>
          <h3 className="text-base font-semibold text-foreground">{r.title}</h3>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p className="font-mono">{r.itinerary_id.slice(0, 8)}…</p>
          <p>{r.segment_count} 个时段</p>
          {persistState === "saving" && (
            <p className="mt-1 text-[#8B5A00] dark:text-[#FFD966]">正在保存…</p>
          )}
          {persistState === "saved" && (
            <p className="mt-1 text-emerald-700 dark:text-emerald-300">已保存，可再次打开</p>
          )}
          {persistState === "error" && (
            <p className="mt-1 text-destructive">保存失败，请重试</p>
          )}
        </div>
      </div>
      <div className="relative px-4 py-4">
        <div className="absolute bottom-6 left-[21px] top-6 w-px bg-border/80" aria-hidden />
        <ul className="relative space-y-4">
          {r.segments.map((seg, idx) => {
            const st = kindStyle[seg.kind] ?? kindStyle.other;
            const Icon = st.Icon;
            return (
              <li key={seg.segment_id || idx} className="flex gap-3">
                <div className="relative z-[1] flex shrink-0 flex-col items-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-muted/90 shadow-sm ring-2 ring-[#FFC300]/25">
                    <Icon className={`h-4 w-4 ${seg.kind === "meal" ? "text-[#FF6B00]" : "text-foreground"}`} />
                  </div>
                </div>
                <div
                  className={`min-w-0 flex-1 rounded-xl border border-border/50 bg-background/60 px-3 py-2.5 border-l-4 ${st.borderAccent}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {st.label}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatRange(seg.start_time_iso, seg.end_time_iso)}
                    </span>
                    {typeof seg.estimated_cost_cny === "number" &&
                    seg.estimated_cost_cny > 0 ? (
                      <span className="ml-auto rounded-full bg-[#FF6B00]/12 px-2 py-0.5 font-mono text-[11px] tabular-nums text-[#8B3A00] dark:text-[#FFB070]">
                        ¥{seg.estimated_cost_cny}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 font-medium text-foreground">{seg.label}</p>
                  {seg.poi_id && (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      POI {seg.poi_id}
                    </p>
                  )}
                  {seg.notes && (
                    <p className="mt-1 text-xs text-muted-foreground">{seg.notes}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <BudgetBar r={r} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-emerald-500/8 px-4 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
        <span className="inline-flex items-center gap-1.5">
          <Coffee className="h-3.5 w-3.5" />
          时间轴校验已通过
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {persistState === "error" && (
            <button
              type="button"
              onClick={retrySave}
              className="rounded-md border border-destructive/40 bg-background px-2 py-1 text-destructive"
            >
              重试保存
            </button>
          )}
          <Link
            href={`/plans/${r.itinerary_id}`}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-600/30 bg-background/90 px-2 py-1 text-emerald-900 hover:bg-emerald-500/15 dark:text-emerald-100"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            再次打开
          </Link>
          <Link
            href="/plans"
            className="text-emerald-900/80 underline-offset-2 hover:underline dark:text-emerald-100/90"
          >
            我的方案
          </Link>
        </div>
      </div>
    </div>
  );
}

export function BuildStructuredItineraryToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  return (
    <ToolCard<ItineraryResult>
      props={props}
      isExpectedShape={isItineraryResult}
      errorMessage="行程结构化失败（时间冲突或参数无效）。"
      skeletonLines={3}
      render={(r) => <ItineraryCard r={r} />}
    />
  );
}
