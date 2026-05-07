"use client";

import { useEffect, useState } from "react";

type FeedbackEntry = {
  id: string;
  reaction: "thumbs_up" | "thumbs_down" | "neutral";
  comment?: string;
  reviewer_label?: string;
  created_at: string;
};

const REACTION_LABEL: Record<FeedbackEntry["reaction"], string> = {
  thumbs_up: "喜欢",
  thumbs_down: "不喜欢，想换",
  neutral: "再看看",
};

export function ShareFeedbackForm({ token }: { token: string }) {
  const [reaction, setReaction] =
    useState<FeedbackEntry["reaction"]>("thumbs_up");
  const [comment, setComment] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<FeedbackEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/share/${token}/feedback`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { items: FeedbackEntry[] };
        if (!cancelled) setItems(data.items ?? []);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/share/${token}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reaction,
          comment: comment || undefined,
          reviewer_label: reviewer || undefined,
        }),
      });
      if (!res.ok) {
        setError("提交失败，请稍后再试");
        return;
      }
      const data = (await res.json()) as { entry: FeedbackEntry };
      setItems((prev) => [data.entry, ...prev]);
      setComment("");
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
      <div className="font-medium">看完想说点什么？</div>
      <div className="flex flex-wrap gap-2">
        {(
          ["thumbs_up", "neutral", "thumbs_down"] as FeedbackEntry["reaction"][]
        ).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReaction(r)}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              reaction === r
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {REACTION_LABEL[r]}
          </button>
        ))}
      </div>
      <input
        value={reviewer}
        onChange={(e) => setReviewer(e.target.value)}
        placeholder="你的称呼（可选，例如：老婆/小张）"
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
      />
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="想换哪一段？想加什么？写一两句给老公看（可选）"
        className="min-h-[64px] w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "提交中…" : "发送反馈"}
        </button>
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>

      {items.length > 0 ? (
        <div className="border-t border-border/40 pt-2">
          <div className="mb-1 text-xs text-muted-foreground">已有反馈：</div>
          <ul className="space-y-1.5">
            {items.map((it) => (
              <li
                key={it.id}
                className="rounded-md border border-border/40 bg-background px-2 py-1.5 text-xs"
              >
                <div>
                  <span
                    className={`mr-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                      it.reaction === "thumbs_up"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : it.reaction === "thumbs_down"
                          ? "bg-rose-500/10 text-rose-600"
                          : "bg-amber-500/10 text-amber-600"
                    }`}
                  >
                    {REACTION_LABEL[it.reaction]}
                  </span>
                  {it.reviewer_label ? (
                    <span className="text-muted-foreground">
                      · {it.reviewer_label}
                    </span>
                  ) : null}
                  <span className="ml-1 text-muted-foreground">
                    · {new Date(it.created_at).toLocaleString("zh-CN")}
                  </span>
                </div>
                {it.comment ? (
                  <p className="mt-1 whitespace-pre-wrap leading-snug">
                    {it.comment}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
