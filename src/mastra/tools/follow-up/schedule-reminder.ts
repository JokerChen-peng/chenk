import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import { z } from "zod";
import { isoDateTimeFromLlm } from "@/src/mastra/tools/nlu/coerce-iso-datetime";
import { appendNotification } from "@/lib/notifications/notifications-store";
import { OUTING_CHAT_THREAD_ID_KEY } from "@/lib/chat/server/outing-todo-store";
import { scheduleReminderViaQstash } from "@/lib/jobs/qstash";

const inputSchema = z.object({
  reminders: z
    .array(
      z.object({
        title: z.string().min(1).max(80),
        body: z.string().min(1).max(280).optional(),
        fire_at_iso: isoDateTimeFromLlm,
      }),
    )
    .min(1)
    .max(10),
});

const outputSchema = z.object({
  scheduled: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      fire_at_iso: z.string(),
      qstash_message_id: z.string().optional(),
    }),
  ),
  message: z.string(),
  delivery: z.enum(["mock_only", "qstash_scheduled"]),
});

function resolveThreadId(
  context: ToolExecutionContext<unknown, unknown, unknown>,
): string | undefined {
  const rc = context.requestContext;
  if (rc?.has(OUTING_CHAT_THREAD_ID_KEY)) {
    const v = rc.get(OUTING_CHAT_THREAD_ID_KEY);
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

export const scheduleReminderTool = createTool({
  id: "schedule_reminder",
  description:
    "把行程相关提醒写入 mock 通知中心（.data/notifications.json）。用于「出发前 30 分钟提醒」「2 小时后接孩子」等场景；前端右上角会出现 toast 与通知列表。",
  inputSchema,
  outputSchema,
  execute: async ({ reminders }, context) => {
    const thread_id = resolveThreadId(context);
    const scheduled = [] as {
      id: string;
      title: string;
      fire_at_iso: string;
      qstash_message_id?: string;
    }[];
    let qstashCount = 0;
    for (const r of reminders) {
      const fire_at_iso = String(r.fire_at_iso);
      const entry = await appendNotification({
        kind: "reminder",
        title: r.title,
        body: r.body,
        fire_at_iso,
        thread_id,
      });
      const qstashInfo = await scheduleReminderViaQstash({
        notification_id: entry.id,
        title: entry.title,
        body: r.body,
        fire_at_iso,
        thread_id,
      }).catch(() => null);
      if (qstashInfo?.qstash_message_id) qstashCount += 1;
      scheduled.push({
        id: entry.id,
        title: entry.title,
        fire_at_iso: entry.fire_at_iso ?? fire_at_iso,
        ...(qstashInfo?.qstash_message_id
          ? { qstash_message_id: qstashInfo.qstash_message_id }
          : {}),
      });
    }
    const delivery: "mock_only" | "qstash_scheduled" =
      qstashCount > 0 ? "qstash_scheduled" : "mock_only";
    const tail =
      delivery === "qstash_scheduled"
        ? `（其中 ${qstashCount} 条已挂到 QStash，到点会真触发 /api/reminders/fire）`
        : "（Mock 通知中心；配 QSTASH_TOKEN 后到点会自动触发）";
    return {
      scheduled,
      message: `已为你安排 ${scheduled.length} 条提醒${tail}`,
      delivery,
    };
  },
});
