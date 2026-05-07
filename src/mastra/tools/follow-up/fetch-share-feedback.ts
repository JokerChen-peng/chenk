import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { listFeedbackForToken } from "@/lib/share/share-feedback-store";

const inputSchema = z.object({
  share_token: z
    .string()
    .min(8)
    .describe("share_outing_summary 返回 share_path 中的 token 部分"),
});

const outputSchema = z.object({
  share_token: z.string(),
  total: z.number().int().nonnegative(),
  by_reaction: z.object({
    thumbs_up: z.number().int().nonnegative(),
    thumbs_down: z.number().int().nonnegative(),
    neutral: z.number().int().nonnegative(),
  }),
  comments: z
    .array(
      z.object({
        reviewer_label: z.string().optional(),
        reaction: z.enum(["thumbs_up", "thumbs_down", "neutral"]),
        comment: z.string().optional(),
        created_at: z.string(),
      }),
    )
    .max(20),
  summary: z.string(),
});

function pathOrToken(input: string): string {
  if (input.startsWith("/share/")) return input.slice("/share/".length);
  return input;
}

export const fetchShareFeedbackTool = createTool({
  id: "fetch_share_feedback",
  description:
    "拉取一条 share 链接累计的亲友反馈（点赞/不喜欢/留言），用于在主会话里继续调整方案。可传完整 /share/<token> 或仅 token。",
  inputSchema,
  outputSchema,
  execute: async ({ share_token }) => {
    const token = pathOrToken(share_token);
    const items = await listFeedbackForToken(token);
    const by_reaction = {
      thumbs_up: items.filter((i) => i.reaction === "thumbs_up").length,
      thumbs_down: items.filter((i) => i.reaction === "thumbs_down").length,
      neutral: items.filter((i) => i.reaction === "neutral").length,
    };
    const comments = items
      .filter((i) => i.comment && i.comment.length > 0)
      .slice(0, 20)
      .map((i) => ({
        reviewer_label: i.reviewer_label,
        reaction: i.reaction,
        comment: i.comment,
        created_at: i.created_at,
      }));
    const summary =
      items.length === 0
        ? "暂无亲友反馈。"
        : `共 ${items.length} 条 · 喜欢 ${by_reaction.thumbs_up} · 想换 ${by_reaction.thumbs_down} · 中立 ${by_reaction.neutral}`;
    return {
      share_token: token,
      total: items.length,
      by_reaction,
      comments,
      summary,
    };
  },
});
