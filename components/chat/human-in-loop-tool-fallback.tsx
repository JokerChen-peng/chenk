"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";

/** 未单独做 Tool UI 时的中文标题（仍保留可选「技术详情」折叠） */
const TOOL_TITLE_ZH: Record<string, string> = {
  load_outing_skill: "载入出行说明",
  write_outing_todos: "记录任务步骤",
  compact_session_context: "整理上下文",
  run_planning_subtask: "子任务调研",
  parse_outing_constraints: "解析出行条件",
  search_enhanced_poi: "搜索地点",
  calculate_transit_matrix: "计算路线时间",
  validate_timeline_feasibility: "校验行程时间",
  build_structured_itinerary: "生成结构化行程",
  execute_transaction: "执行单笔预订",
  execute_transaction_batch: "批量执行预订",
  share_outing_summary: "生成分享摘要",
};

function toolTitleZh(toolName: string) {
  return TOOL_TITLE_ZH[toolName] ?? toolName;
}

export function HumanInLoopToolFallback(props: ToolCallMessagePartProps) {
  const waitingForHuman =
    props.status?.type === "requires-action" &&
    props.status.reason === "interrupt";

  if (waitingForHuman) {
    return (
      <div className="my-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <p className="font-medium text-amber-950 dark:text-amber-100">
          需要人工确认：{toolTitleZh(props.toolName)}
        </p>
        <p className="mt-1 text-muted-foreground">
          对话流已暂停，请确认或拒绝后再继续。
        </p>
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-background/80 p-2 text-xs">
          {JSON.stringify(props.args, null, 2)}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-xs font-medium"
            onClick={() => props.resume({ approved: true })}
          >
            批准执行
          </button>
          <button
            type="button"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium"
            onClick={() =>
              props.resume({
                approved: false,
                reason: "用户拒绝执行该工具调用",
              })
            }
          >
            拒绝
          </button>
        </div>
      </div>
    );
  }

  return (
    <details className="my-2 rounded-xl border border-border/70 bg-muted/25 text-sm open:bg-muted/35">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-foreground">
        <span>{toolTitleZh(props.toolName)}</span>
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          · 技术详情（可选）
        </span>
      </summary>
      <div className="border-t border-border/50 px-3 pb-3 pt-2">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          参数
        </p>
        <pre className="max-h-36 overflow-auto rounded-lg bg-background/90 p-2 text-[11px] leading-relaxed ring-1 ring-border/50">
          {props.argsText}
        </pre>
        {props.result !== undefined && (
          <>
            <p className="mb-1 mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              结果
            </p>
            <pre className="max-h-48 overflow-auto rounded-lg bg-background/90 p-2 text-[11px] leading-relaxed ring-1 ring-border/50">
              {typeof props.result === "string"
                ? props.result
                : JSON.stringify(props.result, null, 2)}
            </pre>
          </>
        )}
      </div>
    </details>
  );
}
