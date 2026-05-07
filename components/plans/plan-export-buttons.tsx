"use client";

import type { SavedOutingPlan } from "@/lib/plans/plan-file-store";
import {
  planExportBasename,
  savedPlanToIcs,
  savedPlanToJsonString,
  savedPlanToMarkdown,
} from "@/lib/plans/plan-export";
import { Calendar, FileJson, FileText } from "lucide-react";

function triggerDownload(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  plan: SavedOutingPlan;
  className?: string;
};

export function PlanExportButtons({ plan, className }: Props) {
  const base = planExportBasename(plan);
  return (
    <div className={className ?? "flex flex-wrap gap-2"}>
      <button
        type="button"
        onClick={() =>
          triggerDownload(
            `${base}.md`,
            savedPlanToMarkdown(plan),
            "text/markdown;charset=utf-8",
          )
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60"
      >
        <FileText className="h-3.5 w-3.5" aria-hidden />
        导出 Markdown
      </button>
      <button
        type="button"
        onClick={() =>
          triggerDownload(
            `${base}.json`,
            savedPlanToJsonString(plan),
            "application/json;charset=utf-8",
          )
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60"
      >
        <FileJson className="h-3.5 w-3.5" aria-hidden />
        导出 JSON
      </button>
      <button
        type="button"
        onClick={() =>
          triggerDownload(
            `${base}.ics`,
            savedPlanToIcs(plan),
            "text/calendar;charset=utf-8",
          )
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60"
      >
        <Calendar className="h-3.5 w-3.5" aria-hidden />
        导出日历 ICS
      </button>
    </div>
  );
}
