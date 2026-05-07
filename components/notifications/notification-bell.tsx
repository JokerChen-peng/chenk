"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type NotificationKind =
  | "reminder"
  | "share_delivery"
  | "transaction"
  | "weather_alert"
  | "system";

type NotificationEntry = {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  fire_at_iso?: string;
  created_at: string;
  thread_id?: string;
  read: boolean;
};

const KIND_BADGE: Record<NotificationKind, { label: string; className: string }> =
  {
    reminder: {
      label: "提醒",
      className: "bg-amber-500/15 text-amber-800 dark:text-amber-100",
    },
    share_delivery: {
      label: "分享",
      className: "bg-sky-500/15 text-sky-800 dark:text-sky-100",
    },
    transaction: {
      label: "交易",
      className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-100",
    },
    weather_alert: {
      label: "天气",
      className: "bg-blue-500/15 text-blue-800 dark:text-blue-100",
    },
    system: {
      label: "系统",
      className: "bg-slate-500/15 text-slate-800 dark:text-slate-100",
    },
  };

export function NotificationBell() {
  const [items, setItems] = useState<NotificationEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 56, right: 16 });
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) return;
    function syncPos() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDropPos({
        top: Math.round(r.bottom + 8),
        right: Math.round(Math.max(16, window.innerWidth - r.right)),
      });
    }
    syncPos();
    window.addEventListener("resize", syncPos);
    window.addEventListener("scroll", syncPos, true);
    return () => {
      window.removeEventListener("resize", syncPos);
      window.removeEventListener("scroll", syncPos, true);
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void (async () => {
        try {
          const res = await fetch("/api/notifications", { cache: "no-store" });
          if (!res.ok) return;
          const data = (await res.json()) as { items: NotificationEntry[] };
          if (!cancelled) setItems(data.items ?? []);
        } catch {
          // ignore
        }
      })();
    };
    tick();
    const id = window.setInterval(tick, 6000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const root = triggerRef.current;
      const t = e.target as Node;
      if (root?.contains(t)) return;
      const panel = document.getElementById("notification-dropdown-panel");
      if (panel?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const unread = items.filter((i) => !i.read);

  async function markAllRead() {
    if (unread.length === 0) return;
    const ids = unread.map((i) => i.id);
    setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, read: true } : i)));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {
      // ignore
    }
  }

  const panel = open && mounted && (
    <div
      id="notification-dropdown-panel"
      className="fixed z-[200] flex w-[min(100vw-2rem,21rem)] max-h-[min(70vh,24rem)] flex-col overflow-hidden rounded-xl border border-border bg-card text-sm shadow-2xl shadow-black/15 ring-1 ring-black/5 dark:ring-white/10 dark:shadow-black/40"
      style={{ top: dropPos.top, right: dropPos.right }}
      role="dialog"
      aria-modal="true"
      aria-label="通知中心"
    >
      {/* 标题栏：不参与滚动，避免 sticky + 外层滚动导致时间戳「飘到标题上面」 */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-card px-3 py-2.5">
        <span className="text-sm font-semibold text-foreground">通知中心（Mock）</span>
        <button
          type="button"
          onClick={markAllRead}
          className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
        >
          全部已读
        </button>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-5 text-xs leading-relaxed text-muted-foreground">
          暂无通知。规划侧 schedule_reminder / share_outing_summary / 执行确认会落到这里。
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
          <ul className="space-y-2">
          {items.slice(0, 30).map((it) => {
            const kind = KIND_BADGE[it.kind];
            const { primary, sharePath } = parseBodyLines(it.body);
            return (
              <li
                key={it.id}
                className={`rounded-lg border px-2.5 py-2 leading-snug shadow-sm ${
                  it.read
                    ? "border-border/60 bg-muted/30"
                    : "border-border/60 bg-background ring-1 ring-sky-400/25 dark:ring-sky-500/25"
                }`}
              >
                <div className="flex flex-wrap items-start gap-1.5">
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${kind.className}`}
                  >
                    {kind.label}
                  </span>
                  <span className="min-w-0 flex-1 font-medium leading-tight text-foreground">
                    {it.title}
                  </span>
                </div>
                {primary ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">{primary}</p>
                ) : null}
                {sharePath ? (
                  <div className="mt-1.5">
                    <Link
                      href={sharePath}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary underline-offset-4 hover:underline"
                    >
                      打开预览页面
                      <span className="font-mono text-[10px] text-muted-foreground">
                        （{sharePath.slice(0, 18)}…）
                      </span>
                    </Link>
                  </div>
                ) : it.body ? (
                  <p className="mt-1 line-clamp-3 break-all text-[11px] text-muted-foreground">
                    {it.body}
                  </p>
                ) : null}
                <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground">
                  {it.fire_at_iso
                    ? `计划 ${new Date(it.fire_at_iso).toLocaleString("zh-CN")}`
                    : new Date(it.created_at).toLocaleString("zh-CN")}
                </p>
              </li>
            );
          })}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="relative" ref={triggerRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:border-primary/40"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          通知
          {unread.length > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {unread.length > 99 ? "99+" : unread.length}
            </span>
          ) : null}
        </button>
      </div>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}

function parseBodyLines(body: string | undefined): {
  primary: string;
  sharePath?: string;
} {
  if (!body?.trim()) return { primary: "", sharePath: undefined };
  const lines = body.split(/\n/).map((l) => l.trim()).filter(Boolean);
  let sharePath: string | undefined;
  const textLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("/share/")) {
      sharePath = line;
    } else if (line.startsWith("http")) {
      try {
        const u = new URL(line);
        sharePath = `${u.pathname}${u.search ?? ""}`;
      } catch {
        textLines.push(line);
      }
    } else {
      textLines.push(line);
    }
  }
  return {
    primary: textLines[0] ?? "",
    sharePath,
  };
}
