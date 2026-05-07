"use client";

import { useThreadRuntime } from "@assistant-ui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/** Invalidate in-flight fetches when a newer `continuePlan` effect runs (e.g. React Strict Mode). */
let continuePlanEffectSeq = 0;

function buildContinueUserMessage(plan: {
  id: string;
  title: string;
  savedAt: string;
  segments: Array<{
    segment_id: string;
    kind: string;
    label: string;
    poi_id?: string;
    start_time_iso: string;
    end_time_iso: string;
    notes?: string;
  }>;
}): string {
  const lines = plan.segments.map((s, i) => {
    const extra = [s.poi_id ? `POI ${s.poi_id}` : null, s.notes ?? null]
      .filter(Boolean)
      .join(" · ");
    return `${i + 1}. [${s.kind}] ${s.label}（${s.start_time_iso} → ${s.end_time_iso}）${extra ? ` — ${extra}` : ""}`;
  });
  return [
    "【从「我的方案」继续调整】",
    `方案 ID：${plan.id}`,
    `标题：${plan.title}`,
    `保存于：${plan.savedAt}`,
    "",
    "请在本对话里基于下面已定稿行程帮我继续改（可改时段顺序、替换地点、重新做时间校验与定稿等）。",
    "",
    "当前时段：",
    ...lines,
  ].join("\n");
}

/**
 * Renders nothing; must be mounted under `<Thread />` (thread runtime context).
 * Reads `?continuePlan=<uuid>` and appends a user message + starts a run, then strips the query.
 */
export function ContinuePlanFromQuery() {
  const thread = useThreadRuntime();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const planId = searchParams.get("continuePlan");
    if (!planId) return;

    const ac = new AbortController();
    const mine = ++continuePlanEffectSeq;

    void (async () => {
      try {
        const res = await fetch(`/api/plans/${encodeURIComponent(planId)}`, {
          signal: ac.signal,
        });
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (mine !== continuePlanEffectSeq) return;
        const plan = (data as { plan?: unknown }).plan;
        if (
          !plan ||
          typeof plan !== "object" ||
          !("id" in plan) ||
          !("title" in plan) ||
          !("segments" in plan) ||
          !Array.isArray((plan as { segments: unknown }).segments)
        ) {
          return;
        }
        const text = buildContinueUserMessage(
          plan as Parameters<typeof buildContinueUserMessage>[0],
        );
        thread.append({
          role: "user",
          content: [{ type: "text", text }],
          startRun: true,
        });
        router.replace("/", { scroll: false });
      } catch {
        /* aborted or network */
      }
    })();

    return () => {
      ac.abort();
    };
  }, [router, searchParams, thread]);

  return null;
}
