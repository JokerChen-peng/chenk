"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tool UI 卡片的统一三态：loading（请求中）/ error（明确错误或类型不符）/
 * ready（结果可渲染）。再加一个 incomplete（agent stream 中断），
 * 让所有 *-tool-ui.tsx 不再各自写 status 判断。
 *
 * 我们只读 props 里需要的几个字段，避免和 @assistant-ui 的多个泛型版本对齐失败。
 */
export type ToolPartStatusInput = {
  isError?: boolean;
  status: { type: "running" | "complete" | "incomplete" | "requires-action" };
  result?: unknown;
};

export type ToolPartStatus = "loading" | "error" | "incomplete" | "ready";

export function getToolPartStatus(props: ToolPartStatusInput): ToolPartStatus {
  if (props.isError) return "error";
  if (props.status.type === "incomplete") return "incomplete";
  if (props.result === undefined) return "loading";
  return "ready";
}

/** 通用骨架（默认 3 行；行高 / 宽度可换） */
export function ToolCardSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "my-3 space-y-2 rounded-2xl border border-border/60 bg-muted/20 p-4",
        className,
      )}
    >
      <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="h-10 w-1 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-muted/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 通用错误条 */
export function ToolCardError({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "my-3 rounded-xl border border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** stream 被中断 */
export function ToolCardIncomplete({
  reason = "工具调用被中断",
  className,
}: {
  reason?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "my-3 rounded-xl border border-amber-300/50 bg-amber-50/60 px-4 py-3 text-sm text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-300",
        className,
      )}
    >
      {reason}
    </div>
  );
}

/**
 * 一站式三态卡片：传一个 errorMessage、loading 骨架配置、result 渲染函数。
 *
 * <ToolCard
 *   props={props}
 *   errorMessage="解析失败"
 *   skeletonLines={3}
 *   render={(r) => <RestaurantList result={r} />}
 *   isExpectedShape={isParseResult}
 * />
 */
export function ToolCard<TResult>(args: {
  props: ToolPartStatusInput;
  errorMessage: string;
  /** 验证 result 是不是期望 shape；返回 false 走 shapeMismatchFallback 或 errorFallback */
  isExpectedShape?: (v: unknown) => v is TResult;
  render: (r: TResult) => ReactNode;
  skeletonLines?: number;
  loadingFallback?: ReactNode;
  /** 工具调用本身报错（isError=true）时使用；缺省时退到 errorMessage */
  errorFallback?: ReactNode;
  /** 工具返回了但形状不对；缺省时复用 errorFallback */
  shapeMismatchFallback?: ReactNode;
  incompleteFallback?: ReactNode;
}) {
  const status = getToolPartStatus(args.props);
  if (status === "loading") {
    return (
      args.loadingFallback ?? <ToolCardSkeleton lines={args.skeletonLines} />
    );
  }
  if (status === "incomplete") {
    return args.incompleteFallback ?? <ToolCardIncomplete />;
  }
  const result = args.props.result;
  if (status === "error") {
    return (
      args.errorFallback ?? <ToolCardError>{args.errorMessage}</ToolCardError>
    );
  }
  const ok = args.isExpectedShape
    ? args.isExpectedShape(result)
    : !!result && typeof result === "object";
  if (!ok) {
    return (
      args.shapeMismatchFallback ??
      args.errorFallback ?? <ToolCardError>{args.errorMessage}</ToolCardError>
    );
  }
  return <>{args.render(result as TResult)}</>;
}
