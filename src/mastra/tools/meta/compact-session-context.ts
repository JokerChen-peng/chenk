import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import {
  estimateMessagesUtf8,
  summarizeMessagesForCompaction,
  writeCompactionTranscript,
} from "@/lib/chat/server/context-compact";
import { OUTING_CHAT_THREAD_ID_KEY } from "@/lib/chat/server/outing-todo-store";
import type { UIMessage } from "ai";
import { z } from "zod";

const compactSessionContextInputSchema = z.object({
  focus: z
    .string()
    .max(500)
    .optional()
    .describe("可选：希望摘要侧重保留的信息（如「保留 poi_id 与预算」）"),
});

const compactSessionContextOutputSchema = z.object({
  summary_markdown: z.string(),
  chars_estimated: z.number(),
  transcript_file: z.string(),
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

export const compactSessionContextTool = createTool({
  id: "compact_session_context",
  description:
    "s06 手动压缩：当对话已经很长、或用户要求「压缩/总结上下文/腾上下文」时调用。基于当前轮可见消息生成高密度摘要，并把完整消息快照写入 .data/transcripts/ 以便追溯。不要向用户朗读整段 JSON。",
  inputSchema: compactSessionContextInputSchema,
  outputSchema: compactSessionContextOutputSchema,
  execute: async ({ focus }, context) => {
    const raw = context.agent?.messages;
    const messages = (Array.isArray(raw) ? raw : []) as UIMessage[];
    const chars = estimateMessagesUtf8(messages);
    const threadKey = resolveThreadKey(context);
    const transcriptFile = await writeCompactionTranscript(
      threadKey,
      messages,
      "manual_compact",
    );
    const blob =
      JSON.stringify(messages).slice(0, 90_000) +
      (focus ? `\n\n侧重说明：${focus}` : "");
    const summary_markdown = await summarizeMessagesForCompaction(blob);
    return {
      summary_markdown,
      chars_estimated: chars,
      transcript_file: transcriptFile,
    };
  },
});
