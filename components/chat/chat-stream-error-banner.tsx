"use client";

import { useChatErrorBannerStore } from "@/lib/chat/client/chat-error-banner-store";
import { AlertTriangle, RefreshCw, X } from "lucide-react";

export function ChatStreamErrorBanner() {
  const payload = useChatErrorBannerStore((s) => s.payload);
  const dismiss = useChatErrorBannerStore((s) => s.dismiss);

  if (!payload) {
    return null;
  }

  return (
    <div
      role="alert"
      className="shrink-0 border-b border-[#f59e0b]/35 bg-gradient-to-r from-amber-500/12 via-amber-500/8 to-transparent px-4 py-3 dark:from-amber-500/15"
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            {payload.title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-900/85 dark:text-amber-100/85">
            {payload.description}
          </p>
          {payload.retryable && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-800/90 dark:text-amber-200/90">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              可稍后重试：关闭此提示后再次发送同一条消息。
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => dismiss()}
          className="shrink-0 rounded-md p-1.5 text-amber-900/70 transition hover:bg-amber-500/15 hover:text-amber-950 dark:text-amber-200/80 dark:hover:text-amber-50"
          aria-label="关闭错误提示"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
