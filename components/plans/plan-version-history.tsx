"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Snapshot = {
  snapshot_id: string;
  id: string;
  title: string;
  version: number;
  savedAt: string;
  segments: { segment_id: string; label: string }[];
  total_estimated_cost_cny?: number;
  parent_snapshot_id?: string;
};

export function PlanVersionHistory({ planId }: { planId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Snapshot[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async (id: string): Promise<Snapshot[]> => {
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(id)}/snapshots`, {
        cache: "no-store",
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { snapshots: Snapshot[] };
      return data.snapshots ?? [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next = await fetchSnapshots(planId);
      if (!cancelled) setItems(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, fetchSnapshots]);

  async function rollback(snapshot_id: string) {
    if (!window.confirm("确定回滚到这个版本？将在历史中追加一条新记录，旧记录仍保留。")) {
      return;
    }
    setBusy(snapshot_id);
    try {
      const res = await fetch(`/api/plans/${encodeURIComponent(planId)}/snapshots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshot_id }),
      });
      if (!res.ok) return;
      router.refresh();
      const next = await fetchSnapshots(planId);
      setItems(next);
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
      <div className="mb-1 font-medium">历史版本（{items.length}）</div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li
            key={it.snapshot_id}
            className="flex items-start justify-between gap-2 rounded-md border border-border/40 bg-background px-2 py-1.5"
          >
            <div className="min-w-0">
              <div>
                <span className="font-medium">v{it.version}</span>
                <span className="ml-1 text-muted-foreground">·</span>
                <span className="ml-1 text-muted-foreground">
                  {new Date(it.savedAt).toLocaleString("zh-CN")}
                </span>
                {typeof it.total_estimated_cost_cny === "number" ? (
                  <span className="ml-1 text-muted-foreground">
                    · ¥{it.total_estimated_cost_cny}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {it.segments.length} 段 · {it.title}
              </p>
            </div>
            <button
              type="button"
              onClick={() => rollback(it.snapshot_id)}
              disabled={busy === it.snapshot_id}
              className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-[11px] hover:border-primary/40 disabled:opacity-50"
            >
              {busy === it.snapshot_id ? "处理中…" : "回滚到此版本"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
