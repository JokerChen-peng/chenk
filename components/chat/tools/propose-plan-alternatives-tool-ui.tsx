"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { Star, Sparkles, Clock, Coins } from "lucide-react";
import { ToolCard } from "./_shared/tool-card";

type OptionSeg = {
  segment_id: string;
  poi_id?: string;
  label: string;
  start_time_iso: string;
  end_time_iso: string;
  estimated_cost_cny?: number;
};

type Alternative = {
  option_id: string;
  title: string;
  tagline: string;
  total_estimated_cost_cny: number;
  segments: OptionSeg[];
};

type AlternativesResult = {
  proposal_id: string;
  base_title: string;
  axes: string[];
  options: Alternative[];
  recommended_option_id: string;
  message: string;
};

const AXIS_LABEL: Record<string, string> = {
  indoor_vs_outdoor: "室内/户外",
  budget: "预算",
  kid_friendly: "亲子友好",
  low_cal: "饮食控量",
  social_intensity: "社交强度",
  distance: "离家距离",
};

const TITLE_TOKEN_LABEL: Record<string, string> = {
  relaxed: "松弛",
  relax: "松弛",
  chill: "松弛",
  coffee: "咖啡",
  cafe: "咖啡",
  outdoor: "户外",
  explorer: "探索",
  explore: "探索",
  foodie: "美食",
  food: "美食",
  experience: "体验",
  family: "亲子",
  kid: "亲子",
  kids: "亲子",
  budget: "省钱",
  premium: "精致",
  romantic: "浪漫",
  city: "城市",
  walk: "漫游",
  indoor: "室内",
  nature: "自然",
  green: "自然",
  social: "社交",
  active: "活力",
  slow: "慢享",
  weekend: "周末",
};

function isAlternativesResult(v: unknown): v is AlternativesResult {
  return (
    !!v &&
    typeof v === "object" &&
    "options" in v &&
    Array.isArray((v as AlternativesResult).options) &&
    "recommended_option_id" in v
  );
}

function formatHm(iso: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function totalDurationMinutes(segs: OptionSeg[]): number {
  if (segs.length === 0) return 0;
  const start = Math.min(...segs.map((s) => new Date(s.start_time_iso).getTime()));
  const end = Math.max(...segs.map((s) => new Date(s.end_time_iso).getTime()));
  return Math.max(0, Math.round((end - start) / 60_000));
}

function formatAlternativeTitle(rawTitle: string): string {
  if (/[\u4e00-\u9fff]/.test(rawTitle)) {
    return rawTitle;
  }

  const tokens = rawTitle
    .toLowerCase()
    .replace(/\.{3,}$/, "")
    .replace(/[_.\/\-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const localized = tokens
    .map((token) => TITLE_TOKEN_LABEL[token] ?? token)
    .filter(Boolean)
    .join("")
    .trim();

  return localized || rawTitle.replace(/[_\-]+/g, " ").trim() || "方案";
}

function AlternativeColumn({
  opt,
  isRecommended,
  maxCost,
}: {
  opt: Alternative;
  isRecommended: boolean;
  maxCost: number;
}) {
  const dur = totalDurationMinutes(opt.segments);
  const hours = Math.floor(dur / 60);
  const mins = dur % 60;
  const costRatio = maxCost > 0 ? Math.min(1, opt.total_estimated_cost_cny / maxCost) : 0;
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col gap-2 rounded-xl border bg-background/60 p-3 ${
        isRecommended
          ? "border-[#FFC300]/70 ring-1 ring-[#FFC300]/40 shadow-md"
          : "border-border/60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 inline-flex items-center rounded-full border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
            方案 {opt.option_id}
          </div>
          <h4 className="truncate text-sm font-semibold text-foreground">
            {formatAlternativeTitle(opt.title)}
          </h4>
        </div>
        {isRecommended && (
          <span className="shrink-0 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[#FFC300] px-2 py-0.5 text-[10px] font-semibold text-[#1a0f0a]">
            <Star className="h-3 w-3" aria-hidden /> 推荐
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-[12px] text-muted-foreground">
        {opt.tagline}
      </p>
      <div className="flex flex-wrap items-center gap-3 border-y border-border/30 py-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Coins className="h-3 w-3 text-[#FF6B00]" aria-hidden />
          <span className="font-mono tabular-nums text-foreground">
            ¥{opt.total_estimated_cost_cny}
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" aria-hidden />
          {hours > 0 ? `${hours}h` : ""}{mins > 0 ? ` ${mins}m` : ""}
        </span>
        <span>· {opt.segments.length} 段</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted/40">
        <div
          className={`h-full rounded-full ${
            isRecommended
              ? "bg-gradient-to-r from-[#FFC300] to-[#FF6B00]"
              : "bg-foreground/40"
          }`}
          style={{ width: `${Math.round(costRatio * 100)}%` }}
        />
      </div>
      <ul className="mt-1 space-y-1.5 text-[12px]">
        {opt.segments.map((s) => (
          <li
            key={s.segment_id}
            className="flex items-start gap-2 rounded-md bg-muted/30 px-2 py-1"
          >
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
              {formatHm(s.start_time_iso)}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground">
              {s.label}
            </span>
            {typeof s.estimated_cost_cny === "number" && s.estimated_cost_cny > 0 ? (
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                ¥{s.estimated_cost_cny}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AlternativesCard({ r }: { r: AlternativesResult }) {
  const maxCost = Math.max(0, ...r.options.map((o) => o.total_estimated_cost_cny));
  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-muted/20 px-4 py-2.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            备选方案 · A/B 对比
          </p>
          <h3 className="text-sm font-semibold text-foreground">{formatAlternativeTitle(r.base_title)}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-[#FFC300]" aria-hidden />
          {(r.axes ?? []).map((a) => (
            <span
              key={a}
              className="rounded-full border border-border/60 bg-background px-1.5 py-0.5"
            >
              {AXIS_LABEL[a] ?? a}
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
        {r.options.map((opt) => (
          <AlternativeColumn
            key={opt.option_id}
            opt={opt}
            isRecommended={opt.option_id === r.recommended_option_id}
            maxCost={maxCost}
          />
        ))}
      </div>
      {r.message ? (
        <p className="border-t border-border/50 bg-muted/10 px-4 py-2 text-[11px] text-muted-foreground">
          {r.message}
        </p>
      ) : null}
    </div>
  );
}

export function ProposePlanAlternativesToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  return (
    <ToolCard<AlternativesResult>
      props={props}
      isExpectedShape={isAlternativesResult}
      errorMessage="备选方案生成失败。"
      skeletonLines={2}
      render={(r) => <AlternativesCard r={r} />}
    />
  );
}
