"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { ExternalLink, Send } from "lucide-react";
import Link from "next/link";
import { ToolCard } from "./_shared/tool-card";

type ShareResult = {
  recipient_label: string;
  audience: "family" | "friends" | "other";
  channel: "link_only" | "wechat_mock" | "sms_mock";
  share_path: string;
  mock_delivered_at: string;
  preview_headline: string;
  summary_bullets: string[];
  message: string;
};

function channelBadge(channel: ShareResult["channel"]): string {
  switch (channel) {
    case "wechat_mock":
      return "Mock 微信";
    case "sms_mock":
      return "Mock 短信";
    default:
      return "仅链接";
  }
}

function isShareResult(v: unknown): v is ShareResult {
  return !!v && typeof v === "object" && "share_path" in v;
}

function ShareCard({ r }: { r: ShareResult }) {
  const abs =
    typeof window !== "undefined"
      ? `${window.location.origin}${r.share_path}`
      : r.share_path;
  return (
    <div className="my-3 rounded-2xl border border-[#FFC300]/35 bg-gradient-to-br from-[#FFC300]/12 to-transparent px-4 py-4 text-sm shadow-sm">
      <div className="flex items-start gap-2">
        <Send className="mt-0.5 h-4 w-4 shrink-0 text-[#FFC300]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">
            亲友预览 · {r.recipient_label}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {channelBadge(r.channel)} · {r.message}
          </p>
          <p className="mt-2 font-medium text-foreground">{r.preview_headline}</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
            {r.summary_bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={r.share_path}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              打开只读页
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
              onClick={() => void navigator.clipboard?.writeText(abs)}
            >
              复制链接
            </button>
          </div>
          <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground/90">
            {abs}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ShareOutingSummaryToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, ShareResult>,
) {
  return (
    <ToolCard<ShareResult>
      props={props}
      isExpectedShape={isShareResult}
      errorMessage="分享摘要生成失败。"
      skeletonLines={2}
      loadingFallback={
        <div className="my-3 flex items-center gap-3 rounded-xl border border-border/70 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#FFC300] border-t-transparent" />
          正在生成亲友预览…
        </div>
      }
      render={(r) => <ShareCard r={r} />}
    />
  );
}
