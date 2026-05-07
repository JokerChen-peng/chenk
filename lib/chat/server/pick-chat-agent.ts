import { isToolUIPart, type UIMessage } from "ai";

const APPROVAL_ID_SEP = "::";

/** Last assistant message ends with tool approval response → must resume on execution agent. */
export function hasV6ApprovalResumeTail(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return false;
  for (const part of last.parts ?? []) {
    if (!isToolUIPart(part) || part.state !== "approval-responded") continue;
    const id = part.approval?.id;
    if (typeof id === "string" && id.includes(APPROVAL_ID_SEP)) return true;
  }
  return false;
}

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    const parts = m.parts ?? [];
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j];
      if (p?.type === "text" && "text" in p && typeof p.text === "string") {
        return p.text;
      }
    }
  }
  return "";
}

/**
 * Heuristic: user explicitly wants to run execute_transaction (Chinese or tool ids).
 * Conservative — generic 「确认」 alone does not trigger execution.
 */
function lastUserRequestsExecution(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const lower = t.toLowerCase();

  if (
    /place_order|book_reservation|cancel_booking|modify_reservation|gift_delivery|grocery_delivery|taxi_pickup|mock_pay/.test(
      lower,
    )
  ) {
    return true;
  }

  if (
    /确认.*(下单|预订|交易|支付|改签|送花|送蛋糕|打车)|同意.*(下单|预订|交易|改签|支付)|(帮我|请|我要).*(下单|预订|改签|支付|付了|结账|送过去)|去下单|去预订|去支付|帮我付/.test(
      t,
    )
  ) {
    return true;
  }

  if (
    /执行.*(订单|预订|交易|改签|支付)|完成.*(下单|预订|改签|支付)|美团钱包.*(付|支付)|一键(下单|多笔|编排)/.test(
      t,
    )
  ) {
    return true;
  }

  return false;
}

export type ChatRouteBody = {
  messages?: UIMessage[];
  resumeData?: Record<string, unknown>;
  runId?: string;
  /** AI SDK / AssistantChatTransport thread id — used server-side for s03 todo scope */
  id?: string;
  requestContext?: Record<string, unknown>;
};

/**
 * Single chat endpoint: route to planning vs execution without manual UI toggle.
 */
export function pickAgentIdForChatBody(body: ChatRouteBody): "planningAgent" | "executionAgent" {
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (body.resumeData != null) {
    return "executionAgent";
  }

  if (hasV6ApprovalResumeTail(messages)) {
    return "executionAgent";
  }

  const last = lastUserText(messages);
  if (lastUserRequestsExecution(last)) {
    return "executionAgent";
  }

  if (/@execute\b|#执行下单\b/.test(last)) {
    return "executionAgent";
  }

  return "planningAgent";
}

/** Context compaction must not rewrite history while an approval resume is in flight. */
export function shouldSkipContextCompaction(body: ChatRouteBody): boolean {
  if (body.resumeData != null) return true;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return hasV6ApprovalResumeTail(messages);
}
