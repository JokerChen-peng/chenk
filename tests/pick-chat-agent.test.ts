import { describe, expect, it } from "vitest";
import {
  pickAgentIdForChatBody,
  shouldSkipContextCompaction,
} from "@/lib/chat/server/pick-chat-agent";
import type { UIMessage } from "ai";

const userMsg = (text: string): UIMessage =>
  ({
    id: `u-${text.slice(0, 6)}`,
    role: "user",
    parts: [{ type: "text", text }],
  }) as unknown as UIMessage;

describe("pickAgentIdForChatBody", () => {
  it("routes plain planning queries to planningAgent", () => {
    expect(
      pickAgentIdForChatBody({ messages: [userMsg("今天下午带孩子出去玩 4-6 小时")] }),
    ).toBe("planningAgent");
  });

  it("routes 「确认下单」 to executionAgent", () => {
    expect(
      pickAgentIdForChatBody({ messages: [userMsg("确认下单 这家餐厅")] }),
    ).toBe("executionAgent");
  });

  it("routes 一键多笔 to executionAgent", () => {
    expect(
      pickAgentIdForChatBody({ messages: [userMsg("一键多笔编排 都下了")] }),
    ).toBe("executionAgent");
  });

  it("routes when user types tool name explicitly", () => {
    expect(
      pickAgentIdForChatBody({ messages: [userMsg("execute place_order")] }),
    ).toBe("executionAgent");
    expect(
      pickAgentIdForChatBody({ messages: [userMsg("用 modify_reservation")] }),
    ).toBe("executionAgent");
  });

  it("routes 美团钱包付一下 to executionAgent", () => {
    expect(
      pickAgentIdForChatBody({ messages: [userMsg("美团钱包付一下吧")] }),
    ).toBe("executionAgent");
  });

  it("does not trigger execution on bare 确认", () => {
    expect(
      pickAgentIdForChatBody({ messages: [userMsg("确认")] }),
    ).toBe("planningAgent");
  });

  it("routes when resumeData is present", () => {
    expect(
      pickAgentIdForChatBody({
        messages: [userMsg("再看看")],
        resumeData: { approved: true },
      }),
    ).toBe("executionAgent");
  });

  it("routes 改签到 6:30 to executionAgent", () => {
    expect(
      pickAgentIdForChatBody({ messages: [userMsg("帮我改签到 6:30")] }),
    ).toBe("executionAgent");
  });
});

describe("shouldSkipContextCompaction", () => {
  it("returns true when resumeData is present", () => {
    expect(
      shouldSkipContextCompaction({
        messages: [userMsg("hi")],
        resumeData: { approved: true },
      }),
    ).toBe(true);
  });

  it("returns false for plain user messages", () => {
    expect(
      shouldSkipContextCompaction({ messages: [userMsg("plan a day")] }),
    ).toBe(false);
  });
});
