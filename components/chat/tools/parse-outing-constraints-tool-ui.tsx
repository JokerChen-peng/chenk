"use client";

import type { ReactNode } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import {
  Baby,
  Clock,
  MapPin,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { ToolCard } from "./_shared/tool-card";

type TimeSemantics = {
  timezone: string;
  anchor_iso: string;
  outing_date: string;
  window_label: string;
  window_clock_start: string;
  window_clock_end: string;
  window_start_iso: string;
  window_end_iso: string;
  human_readable: string;
  confidence: string;
};

type ParseResult = {
  scene: "family" | "friends" | "solo" | "unknown";
  duration_hours_target: number;
  party_size: number;
  inferred_home_adcode: string;
  max_travel_km_from_home: number;
  budget_hint_cny: number;
  dietary_notes: string[];
  activity_hints: string[];
  suggested_category_matrix: string[];
  time_semantics: TimeSemantics;
  raw_summary: string;
  overridden_fields?: string[];
};

function isParseResult(v: unknown): v is ParseResult {
  return (
    !!v &&
    typeof v === "object" &&
    "scene" in v &&
    "inferred_home_adcode" in v &&
    typeof (v as ParseResult).inferred_home_adcode === "string" &&
    "time_semantics" in v &&
    typeof (v as ParseResult).time_semantics === "object"
  );
}

const windowLabelZh: Record<string, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
  midday: "中午",
  full_day: "全天",
  unspecified: "未指定",
};

const sceneLabel: Record<ParseResult["scene"], string> = {
  family: "家庭",
  friends: "朋友聚会",
  solo: "独自",
  unknown: "通用",
};

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[#FFF8E7] px-2.5 py-0.5 text-[11px] font-medium text-[#8B5A00] dark:bg-[#3d2f10] dark:text-[#FFD966]">
      {children}
    </span>
  );
}

function ParseResultCard({ r }: { r: ParseResult }) {
  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-[#FFE4A8]/80 bg-gradient-to-br from-[#FFFBF2] via-card to-[#FFF5E4] shadow-sm dark:border-[#5c4a2a]/50 dark:from-[#2a2318] dark:via-card dark:to-[#1a1610]">
      <div className="flex items-center gap-2 border-b border-[#FFC300]/25 bg-[#FFC300]/10 px-4 py-2.5 dark:bg-[#FFC300]/5">
        <Sparkles className="h-4 w-4 text-[#C97800]" />
        <span className="text-sm font-semibold text-foreground">需求理解</span>
        <Chip>{sceneLabel[r.scene]}</Chip>
        {(r.overridden_fields?.length ?? 0) > 0 ? (
          <span
            className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            title={`LLM 抽取并覆盖了 baseline：${r.overridden_fields!.join(", ")}`}
          >
            LLM 抽取 {r.overridden_fields!.length} 项
          </span>
        ) : null}
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="flex gap-2 text-sm">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">人数</p>
            <p className="font-medium">{r.party_size} 人</p>
          </div>
        </div>
        <div className="flex gap-2 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">目标时长</p>
            <p className="font-medium">约 {r.duration_hours_target} 小时</p>
          </div>
        </div>
        <div className="sm:col-span-2 flex gap-2 rounded-xl border border-[#FFC300]/25 bg-[#FFC300]/5 px-3 py-2.5 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#C97800]" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              时间语义（{r.time_semantics.timezone}）
            </p>
            <p className="mt-0.5 font-mono text-xs text-foreground/90">
              {r.time_semantics.outing_date}{" "}
              <span className="text-muted-foreground">
                {windowLabelZh[r.time_semantics.window_label] ??
                  r.time_semantics.window_label}
              </span>{" "}
              {r.time_semantics.window_clock_start}–
              {r.time_semantics.window_clock_end}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {r.time_semantics.human_readable}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground/80">
              置信度 {r.time_semantics.confidence} · anchor{" "}
              {new Date(r.time_semantics.anchor_iso).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
            </p>
          </div>
        </div>
        <div className="flex gap-2 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">推断区域 adcode</p>
            <p className="font-mono text-sm font-medium">{r.inferred_home_adcode}</p>
            <p className="text-xs text-muted-foreground">
              活动半径约 {r.max_travel_km_from_home} km
            </p>
          </div>
        </div>
        <div className="flex gap-2 text-sm">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">预算参考</p>
            <p className="font-medium">¥{r.budget_hint_cny}</p>
          </div>
        </div>
      </div>
      {(r.dietary_notes.length > 0 || r.activity_hints.length > 0) && (
        <div className="border-t border-border/40 px-4 py-3 text-sm">
          {r.dietary_notes.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5">
              <Baby className="h-3.5 w-3.5 text-muted-foreground" />
              {r.dietary_notes.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </p>
          )}
          {r.activity_hints.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {r.activity_hints.map((t) => (
                <Chip key={t}>{t}</Chip>
              ))}
            </p>
          )}
        </div>
      )}
      <div className="border-t border-border/40 bg-muted/20 px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">建议品类</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {r.suggested_category_matrix.map((c) => (
            <span
              key={c}
              className="rounded-md border border-[#FFC300]/40 bg-background/80 px-2 py-0.5 text-xs font-medium"
            >
              {c}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm text-foreground/90">{r.raw_summary}</p>
      </div>
    </div>
  );
}

export function ParseOutingConstraintsToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  return (
    <ToolCard<ParseResult>
      props={props}
      isExpectedShape={isParseResult}
      errorMessage="需求解析失败，请换种说法重试。"
      skeletonLines={2}
      render={(r) => <ParseResultCard r={r} />}
    />
  );
}
