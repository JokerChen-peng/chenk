import { NextResponse } from "next/server";
import { z } from "zod";
import { appendNotification } from "@/lib/notifications/notifications-store";
import { getQstashReceiver } from "@/lib/jobs/qstash";

export const dynamic = "force-dynamic";

const payloadSchema = z.object({
  notification_id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().optional(),
  fire_at_iso: z.string().min(1),
  thread_id: z.string().optional(),
});

/**
 * QStash 在指定 notBefore 时间点会 POST 这条 url，body 就是当时
 * scheduleReminderViaQstash 里塞进去的 ReminderJobPayload。
 *
 * 这里我们追加一条"已触发的副本"通知（带 [已触发] 前缀）。前端通知列表会立刻看到，
 * 不需要轮询。生产里把这一条改成 Web Push / 短信 / 邮件就是真触达了。
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const receiver = getQstashReceiver();
  if (receiver) {
    const signature = req.headers.get("upstash-signature") ?? "";
    const ok = await receiver
      .verify({ signature, body: raw })
      .catch(() => false);
    if (!ok) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { title, body: text, fire_at_iso, thread_id, notification_id } =
    parsed.data;
  await appendNotification({
    kind: "reminder",
    title: `[已触发] ${title}`,
    body: text ?? `提醒源 id=${notification_id}`,
    fire_at_iso,
    thread_id,
  });
  return NextResponse.json({ ok: true });
}
