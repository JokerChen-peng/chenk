import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import {
  OUTING_CHAT_THREAD_ID_KEY,
  setOutingTodos,
  type OutingTodoItem,
} from "@/lib/chat/server/outing-todo-store";
import { z } from "zod";

const todoItemSchema = z.object({
  id: z.string().min(1).max(64).describe("稳定 id，同一任务跨轮次更新时保持一致"),
  text: z.string().min(1).max(400).describe("一步骤的人类可读描述"),
  status: z
    .enum(["pending", "in_progress", "completed"])
    .describe("同时只能有一条 in_progress"),
});

const writeOutingTodosInputSchema = z.object({
  items: z
    .array(todoItemSchema)
    .min(1)
    .max(20)
    .describe("当前会话的完整待办快照（覆盖写入，不是增量 patch）"),
});

const writeOutingTodosOutputSchema = z.object({
  markdown: z.string(),
  items: z.array(todoItemSchema),
  thread_key: z.string(),
});

function resolveThreadKey(
  context: ToolExecutionContext<unknown, unknown, unknown>,
): string {
  const rc = context.requestContext;
  if (rc?.has(OUTING_CHAT_THREAD_ID_KEY)) {
    const v = rc.get(OUTING_CHAT_THREAD_ID_KEY);
    if (typeof v === "string" && v.length > 0) return v;
  }
  const tid = context.agent?.threadId;
  if (typeof tid === "string" && tid.length > 0) return tid;
  return "__anonymous__";
}

function validateTodos(items: OutingTodoItem[]): void {
  const inProgress = items.filter((t) => t.status === "in_progress");
  if (inProgress.length > 1) {
    throw new Error(
      "同一时间只能有一条 in_progress；请将其余进行中项改为 pending 或 completed。",
    );
  }
}

export const writeOutingTodosTool = createTool({
  id: "write_outing_todos",
  description:
    "s03 TodoWrite：用**完整列表覆盖**当前会话的显式计划。多步任务（≥3 子步骤或多工具链）时，**先**写入待办并标一条 in_progress，再动其它工具；每完成一步就再次调用本工具更新状态（completed / 下一条 in_progress）。不要把待办清单原文写进对用户的可见回复，除非用户明确要求看进度。",
  inputSchema: writeOutingTodosInputSchema,
  outputSchema: writeOutingTodosOutputSchema,
  execute: async (input, context) => {
    const threadKey = resolveThreadKey(context);
    const items: OutingTodoItem[] = input.items.map((i) => ({
      id: i.id,
      text: i.text,
      status: i.status,
    }));
    validateTodos(items);
    const { markdown, items: stored } = setOutingTodos(threadKey, items);
    return {
      markdown,
      items: stored,
      thread_key: threadKey,
    };
  },
});
