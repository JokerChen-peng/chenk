"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  planExportBasename,
  savedPlanToIcs,
  savedPlanToJsonString,
  savedPlanToMarkdown,
} from "@/lib/plans/plan-export";
import type { SavedOutingPlan } from "@/lib/plans/plan-file-store";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";

type Props = {
  plan: SavedOutingPlan;
};

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

export function PlanListRowActions({ plan }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"delete" | "rename" | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openRename = useCallback(() => {
    inputRef.current!.value = plan.title;
    dialogRef.current?.showModal();
  }, [plan.title]);

  const closeRename = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const submitRename = useCallback(async () => {
    const title = inputRef.current?.value.trim() ?? "";
    if (!title) return;
    setBusy("rename");
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(plan.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return;
      closeRename();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }, [closeRename, plan.id, router]);

  const onDelete = useCallback(async () => {
    if (
      !window.confirm(
        `确定删除方案「${plan.title}」？此操作不可恢复。`,
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(plan.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      router.refresh();
    } finally {
      setBusy(null);
    }
  }, [plan.id, plan.title, router]);

  const base = planExportBasename(plan);

  return (
    <>
      <div
        className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3"
        onClick={(e) => e.preventDefault()}
      >
        <Link
          href={`/?continuePlan=${encodeURIComponent(plan.id)}`}
          className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          在对话中继续
        </Link>
        <button
          type="button"
          onClick={openRename}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/60 disabled:opacity-50"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          重命名
        </button>
        <button
          type="button"
          onClick={() =>
            triggerDownload(
              `${base}.md`,
              savedPlanToMarkdown(plan),
              "text/markdown;charset=utf-8",
            )
          }
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/60"
        >
          导出 MD
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
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/60"
        >
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
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/60"
        >
          导出日历 ICS
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {busy === "delete" ? "删除中…" : "删除"}
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 z-50 w-[min(100vw-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-4 text-foreground shadow-lg backdrop:bg-black/40"
      >
        <p className="text-sm font-medium">重命名方案</p>
        <input
          ref={inputRef}
          type="text"
          maxLength={200}
          className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="新标题"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submitRename();
            }
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeRename}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void submitRename()}
            disabled={busy === "rename"}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy === "rename" ? "保存中…" : "保存"}
          </button>
        </div>
      </dialog>
    </>
  );
}
