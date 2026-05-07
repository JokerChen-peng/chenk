import { create } from "zustand";

export type ChatErrorBannerPayload = {
  title: string;
  description: string;
  retryable: boolean;
};

type ChatErrorBannerState = {
  payload: ChatErrorBannerPayload | null;
  dismiss: () => void;
  setFromChatError: (
    error: Error | undefined,
    dismiss: () => void,
  ) => void;
};

export const useChatErrorBannerStore = create<ChatErrorBannerState>((set) => ({
  payload: null,
  dismiss: () => {},
  setFromChatError: (error, dismiss) => {
    if (!error) {
      set({ payload: null, dismiss });
      return;
    }
    set({ payload: formatChatErrorForBanner(error), dismiss });
  },
}));

export function formatChatErrorForBanner(error: Error): ChatErrorBannerPayload {
  const raw = `${error.name} ${error.message} ${(error as Error & { cause?: unknown }).cause ?? ""}`;
  const lower = raw.toLowerCase();

  const retryable =
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("try again") ||
    lower.includes("high demand") ||
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("econnreset") ||
    lower.includes("network");

  if (
    lower.includes("503") ||
    lower.includes("high demand") ||
    lower.includes("unavailable")
  ) {
    return {
      title: "模型服务暂时繁忙",
      description:
        "上游返回 503（当前访问量较高）。通常是短暂情况，请稍后点击重试或稍等几分钟再发消息。",
      retryable,
    };
  }

  if (lower.includes("429") || lower.includes("rate limit")) {
    return {
      title: "请求过于频繁",
      description: "触发限流，请稍后再试。",
      retryable,
    };
  }

  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("api key") ||
    lower.includes("permission")
  ) {
    return {
      title: "鉴权失败",
      description:
        "请检查 .env.local 中的 API Key / 项目权限是否与当前模型一致。",
      retryable: false,
    };
  }

  return {
    title: "对话请求失败",
    description: error.message || "未知错误，请查看终端日志或稍后重试。",
    retryable,
  };
}
