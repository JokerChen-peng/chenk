import { createTool } from "@mastra/core/tools";
import {
  encodeSharePayload,
  type SharePayloadV1,
} from "@/lib/share/share-outing-payload";
import { appendNotification } from "@/lib/notifications/notifications-store";
import { z } from "zod";

const shareOutingSummaryInputSchema = z.object({
  recipient_label: z
    .string()
    .min(1)
    .max(32)
    .describe("收信人称呼，如：小张、老婆、朋友们"),
  audience: z
    .enum(["family", "friends", "other"])
    .describe("受众：家人 / 朋友 / 其他"),
  headline: z
    .string()
    .min(1)
    .max(100)
    .describe("一句话标题，如：今天下午 outing 安排"),
  bullets: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(8)
    .describe("要点列表，便于对方快速扫读"),
  channel: z
    .enum(["link_only", "wechat_mock", "sms_mock"])
    .default("link_only")
    .describe("Mock 通道：仅链接 / 假装微信已发 / 假装短信已发"),
});

const shareOutingSummaryOutputSchema = z.object({
  recipient_label: z.string(),
  audience: z.enum(["family", "friends", "other"]),
  channel: z.enum(["link_only", "wechat_mock", "sms_mock"]),
  share_path: z.string(),
  share_token: z.string(),
  mock_delivered_at: z.string(),
  preview_headline: z.string(),
  summary_bullets: z.array(z.string()),
  message: z.string(),
});

export const shareOutingSummaryTool = createTool({
  id: "share_outing_summary",
  description:
    "Mock: build a read-only share link + optional fake delivery for family/friends (e.g. 发给小张、给老婆看). 现在还会同时把「已送达」事件写入通知中心，用户右上角会看到 toast。亲友打开 share 链接可点赞/留言反馈。",
  inputSchema: shareOutingSummaryInputSchema,
  outputSchema: shareOutingSummaryOutputSchema,
  execute: async (input) => {
    const created_at = new Date().toISOString();
    const channel: "link_only" | "wechat_mock" | "sms_mock" =
      input.channel ?? "link_only";
    const body: SharePayloadV1 = {
      v: 1,
      recipient_label: input.recipient_label,
      audience: input.audience,
      headline: input.headline,
      bullets: input.bullets,
      created_at,
    };
    const token = encodeSharePayload(body);
    const share_path = `/share/${token}`;

    const channelNote =
      channel === "wechat_mock"
        ? "（Mock）已模拟通过微信发出摘要。"
        : channel === "sms_mock"
          ? "（Mock）已模拟通过短信发出摘要。"
          : "请复制下方链接发给对方即可打开只读预览。";

    await appendNotification({
      kind: "share_delivery",
      title: `已${channel === "link_only" ? "生成链接" : "Mock 投递"}给 ${input.recipient_label}`,
      body: `${input.headline}\n${share_path}`,
    });

    return {
      recipient_label: input.recipient_label,
      audience: input.audience,
      channel,
      share_path,
      share_token: token,
      mock_delivered_at: created_at,
      preview_headline: input.headline,
      summary_bullets: input.bullets,
      message: `${channelNote} 受众：${input.audience === "family" ? "家人" : input.audience === "friends" ? "朋友" : "其他"} · 收信：${input.recipient_label}`,
    };
  },
});
