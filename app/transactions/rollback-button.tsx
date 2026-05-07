"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RollbackBundleButton({
  bundleId,
  alreadyRolledBack,
}: {
  bundleId: string;
  alreadyRolledBack: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyRolledBack) {
    return (
      <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-700 dark:text-red-300">
        已撤销
      </span>
    );
  }

  async function onClick() {
    if (busy) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "确认撤销整个 bundle 吗？\n\n（mock 环境不会真的退款；实际生产会调用对应 vendor 的取消 API）",
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/transactions/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundle_id: bundleId,
          reason: "用户在 /transactions 一键撤销",
        }),
      });
      if (!res.ok) {
        throw new Error(`${res.status} ${await res.text()}`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded-md border border-red-500/40 bg-background px-2 py-1 text-[11px] font-medium text-red-700 transition hover:bg-red-500/10 disabled:opacity-50 dark:text-red-300"
      >
        {busy ? "撤销中…" : "一键撤销整个 bundle"}
      </button>
      {error ? (
        <p className="text-[10px] text-destructive">撤销失败：{error}</p>
      ) : null}
    </div>
  );
}
