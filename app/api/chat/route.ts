import type { ChatStreamHandlerParams } from "@mastra/ai-sdk";
import { handleChatStream } from "@mastra/ai-sdk";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { RequestContext } from "@mastra/core/di";
import { mastra } from "@/src/mastra";
import { OUTING_CHAT_THREAD_ID_KEY } from "@/lib/chat/server/outing-todo-store";
import { compactMessagesForAgentRequest } from "@/lib/chat/server/context-compact";
import {
  pickAgentIdForChatBody,
  shouldSkipContextCompaction,
  type ChatRouteBody,
} from "@/lib/chat/server/pick-chat-agent";
import {
  buildMockAgentStream,
  isMockAgentMode,
} from "@/lib/chat/server/mock-agent-stream";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ANONYMOUS_RESOURCE_ID = "anonymous";

async function resolveResourceId(): Promise<string> {
  try {
    const session = await auth();
    const id = (session?.user as { id?: string } | undefined)?.id;
    if (typeof id === "string" && id.length > 0) return id;
    const email = session?.user?.email;
    if (typeof email === "string" && email.length > 0) return email;
  } catch {
    // 没配 AUTH_SECRET 等情况：直接走匿名，保持向下兼容。
  }
  return ANONYMOUS_RESOURCE_ID;
}

function mergeChatRequestContext(
  body: Record<string, unknown>,
): RequestContext | undefined {
  const rc = new RequestContext();
  const raw = body.requestContext;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      rc.set(k, v);
    }
  }
  if (typeof body.id === "string" && body.id.length > 0) {
    rc.set(OUTING_CHAT_THREAD_ID_KEY, body.id);
  }
  if (rc.size() === 0) return undefined;
  return rc;
}

const HOME_HINT_SYSTEM_PREFIX = "[home_adcode_hint]";

function homeHintFromBody(body: Record<string, unknown>): string | null {
  const raw = body.requestContext;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = (raw as Record<string, unknown>).home_adcode_hint;
  if (typeof v !== "string") return null;
  if (!/^\d{6}$/.test(v)) return null;
  return v;
}

/**
 * 把 home_adcode_hint 渲染成一段额外 system prompt 文本。
 * 注意：不要把它包成 UIMessage 塞进 messages 列表 —— Mastra 的 MessageList 校验
 * 系统消息必须是 CoreMessage 形态（{role, content}），不接受 AI-SDK 的 {role, parts}。
 * 我们通过 AgentExecutionOptions.system 传入，让 Mastra 自行拼接到模型 prompt 上。
 */
function buildHomeHintSystemText(hint: string): string {
  return `${HOME_HINT_SYSTEM_PREFIX} 用户在前端已设置默认家所在 adcode：${hint}（来自浏览器定位/手动选择）。除非用户在本轮明显另指其他区域，否则 parse_outing_constraints 的 home_adcode、search_enhanced_poi 的 adcode_boundary、validate_geo_envelope 的 home_adcode 默认都用它。`;
}

/**
 * 体检：把可能从老缓存里残留的、UIMessage 形态的 home_adcode_hint 系统消息从 messages 中剔除。
 * 老的 store 可能在历史消息里写入过 system 消息，这里做一次清洗，避免再次触发 INVALID_SYSTEM_MESSAGE_FORMAT。
 */
function stripStaleHomeHintMessages<M extends UIMessage>(messages: M[]): M[] {
  return messages.filter((m) => {
    if (m.role !== "system") return true;
    const parts = (m.parts ?? []) as Array<{ type?: string; text?: string }>;
    if (
      parts.some(
        (p) =>
          p?.type === "text" &&
          (p.text ?? "").startsWith(HOME_HINT_SYSTEM_PREFIX),
      )
    ) {
      return false;
    }
    return true;
  });
}

export async function POST(req: Request) {
  const params = (await req.json()) as Record<string, unknown>;
  const body = params as ChatRouteBody;
  const agentId = pickAgentIdForChatBody(body);
  const requestContext = mergeChatRequestContext(params);

  const rawMessages = Array.isArray(body.messages)
    ? (body.messages as UIMessage[])
    : [];
  let messagesForModel = rawMessages;
  if (!shouldSkipContextCompaction(body) && rawMessages.length > 0) {
    const threadKey =
      typeof body.id === "string" && body.id.length > 0
        ? body.id
        : "__anonymous__";
    const { messages } = await compactMessagesForAgentRequest(
      rawMessages,
      threadKey,
    );
    messagesForModel = messages;
  }
  // 总是清洗历史中残留的旧 UIMessage-形 system home hint
  messagesForModel = stripStaleHomeHintMessages(messagesForModel);

  const homeHint = homeHintFromBody(params);
  const homeHintSystemText = homeHint ? buildHomeHintSystemText(homeHint) : null;

  const resourceId = await resolveResourceId();
  const threadId =
    typeof body.id === "string" && body.id.length > 0 ? body.id : undefined;
  const memoryOption =
    threadId !== undefined ? { thread: threadId, resource: resourceId } : undefined;

  if (isMockAgentMode()) {
    const lastUser = [...rawMessages].reverse().find((m) => m.role === "user");
    const lastUserText = (() => {
      const parts = (lastUser?.parts ?? []) as Array<{
        type?: string;
        text?: string;
      }>;
      return parts
        .filter((p) => p?.type === "text" && typeof p.text === "string")
        .map((p) => p.text)
        .join("\n")
        .trim();
    })();
    const mockStream = buildMockAgentStream({
      agentId:
        agentId === "executionAgent" ? "executionAgent" : "planningAgent",
      lastUserText,
    });
    return createUIMessageStreamResponse({ stream: mockStream });
  }

  const stream = await handleChatStream({
    mastra,
    agentId,
    version: "v6",
    params: {
      ...params,
      messages: messagesForModel,
      ...(requestContext && { requestContext }),
      // 通过 AgentExecutionOptions.system 注入家位置提示，Mastra 会自动拼到模型 system prompt。
      // 不要塞进 messages 列表 —— MessageList 会拒绝 UIMessage 形态的 system 消息。
      ...(homeHintSystemText && { system: homeHintSystemText }),
      // Tier S #1 + #2: thread = 当前对话；resource = 当前登录用户邮箱。
      // 同一邮箱再回来时，Mastra Memory 会跨线程召回历史 / observational memory。
      ...(memoryOption && { memory: memoryOption }),
    } as ChatStreamHandlerParams<UIMessage>,
    onError: (error) => {
      if (error instanceof Error) {
        return error.message;
      }
      return "Unknown agent streaming error";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
