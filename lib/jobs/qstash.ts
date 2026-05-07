import { Client, Receiver } from "@upstash/qstash";

/**
 * Tier S #3: QStash —— 让 schedule_reminder 真正"到点会响"。
 *
 * - 设了 QSTASH_TOKEN 才启用；缺则保留旧行为（只把通知写进 .data/notifications.json，
 *   不会自动到点触发），保证 demo 在离线环境也能跑。
 * - publishJSON 一次给一个 URL POST，可以用 delay (秒) 或 notBefore (Unix ms)。
 *   我们要的是"特定时间点 fire 一次"，所以用 notBefore。
 * - Webhook 的签名校验用 Receiver；keys 在 Upstash 控制台里抄一份过来。
 */

let cachedClient: Client | null = null;
let cachedReceiver: Receiver | null = null;

export function getQstashClient(): Client | null {
  if (cachedClient) return cachedClient;
  const token = process.env.QSTASH_TOKEN?.trim();
  if (!token) return null;
  cachedClient = new Client({ token });
  return cachedClient;
}

export function getQstashReceiver(): Receiver | null {
  if (cachedReceiver) return cachedReceiver;
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY?.trim();
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY?.trim();
  if (!currentSigningKey || !nextSigningKey) return null;
  cachedReceiver = new Receiver({
    currentSigningKey,
    nextSigningKey,
  });
  return cachedReceiver;
}

/** 从 env 推导出能让 QStash 反向回调到的 https 入口。 */
function buildPublicWebhookUrl(): string | null {
  const explicit = process.env.QSTASH_REMINDER_URL?.trim();
  if (explicit) return explicit;
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}/api/reminders/fire`;
  const publicBase = process.env.PUBLIC_BASE_URL?.trim();
  if (publicBase) return `${publicBase.replace(/\/$/, "")}/api/reminders/fire`;
  return null;
}

export type ReminderJobPayload = {
  notification_id: string;
  title: string;
  body?: string;
  fire_at_iso: string;
  thread_id?: string;
};

export type ScheduledReminderInfo = {
  notification_id: string;
  qstash_message_id: string;
  fire_at_iso: string;
};

/**
 * 把"行前 30 分钟"这类提醒交给 QStash。
 * - fire_at_iso 在过去：直接返回 null，让上层退化成"立刻投递"路径。
 * - 没配 QSTASH_TOKEN 或公网 url：返回 null，调用方写进 notifications.json 即可。
 */
export async function scheduleReminderViaQstash(
  payload: ReminderJobPayload,
): Promise<ScheduledReminderInfo | null> {
  const client = getQstashClient();
  if (!client) return null;
  const url = buildPublicWebhookUrl();
  if (!url) return null;
  const fireAt = new Date(payload.fire_at_iso);
  if (Number.isNaN(fireAt.getTime())) return null;
  const notBefore = Math.floor(fireAt.getTime() / 1000);
  if (notBefore <= Math.floor(Date.now() / 1000)) return null;
  const res = await client.publishJSON({
    url,
    body: payload,
    notBefore,
    retries: 1,
  });
  const messageId =
    (res as { messageId?: string }).messageId ??
    (Array.isArray(res) && (res[0] as { messageId?: string })?.messageId) ??
    "";
  return {
    notification_id: payload.notification_id,
    qstash_message_id: String(messageId || ""),
    fire_at_iso: payload.fire_at_iso,
  };
}
