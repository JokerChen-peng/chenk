"use client";

import { useMemo, useRef, useState } from "react";
import type { CreateUIMessage, UIMessage, useChat } from "@ai-sdk/react";
import { isToolUIPart } from "ai";
import {
  useExternalStoreRuntime,
  useRuntimeAdapters,
  useToolInvocations,
  type ToolExecutionStatus,
} from "@assistant-ui/core/react";
import type {
  AppendMessage,
  AssistantRuntime,
  ExternalStoreAdapter,
  MessageFormatAdapter,
  MessageFormatItem,
  MessageFormatRepository,
  RunConfig,
  ThreadHistoryAdapter,
  ThreadMessage,
} from "@assistant-ui/core";
import { getExternalStoreMessages } from "@assistant-ui/core";
import { sliceMessagesUntil } from "../../../node_modules/@assistant-ui/react-ai-sdk/dist/ui/utils/sliceMessagesUntil.js";
import { toCreateMessage } from "../../../node_modules/@assistant-ui/react-ai-sdk/dist/ui/utils/toCreateMessage.js";
import { vercelAttachmentAdapter } from "../../../node_modules/@assistant-ui/react-ai-sdk/dist/ui/utils/vercelAttachmentAdapter.js";
import { getVercelAIMessages } from "../../../node_modules/@assistant-ui/react-ai-sdk/dist/ui/getVercelAIMessages.js";
import { AISDKMessageConverter } from "../../../node_modules/@assistant-ui/react-ai-sdk/dist/ui/utils/convertMessage.js";
import {
  aiSDKV6FormatAdapter,
  type AISDKStorageFormat,
} from "../../../node_modules/@assistant-ui/react-ai-sdk/dist/ui/adapters/aiSDKFormatAdapter.js";
import {
  toExportedMessageRepository,
  useExternalHistory,
} from "../../../node_modules/@assistant-ui/react-ai-sdk/dist/ui/use-chat/useExternalHistory.js";
import { useStreamingTiming } from "../../../node_modules/@assistant-ui/react-ai-sdk/dist/ui/use-chat/useStreamingTiming.js";

export type CustomToCreateMessageFunction = <
  UI_MESSAGE extends UIMessage = UIMessage,
>(
  message: AppendMessage,
) => CreateUIMessage<UI_MESSAGE>;

export type MastraAISDKRuntimeAdapter = {
  adapters?:
    | (NonNullable<ExternalStoreAdapter["adapters"]> & {
        history?: ThreadHistoryAdapter | undefined;
      })
    | undefined;
  toCreateMessage?: CustomToCreateMessageFunction;
  cancelPendingToolCallsOnSend?: boolean | undefined;
};

type ApprovalResumePayload = {
  approved: boolean;
  reason?: string;
};

/** Align assistant-ui stream ids (`toolId:rewrite:n`) with persisted UI message toolCallIds. */
function normalizeToolCallIdForApproval(toolCallId: string): string {
  return toolCallId.replace(/:rewrite:\d+$/, "");
}

export function useMastraAISDKRuntime<UI_MESSAGE extends UIMessage = UIMessage>(
  chatHelpers: ReturnType<typeof useChat<UI_MESSAGE>>,
  {
    adapters,
    toCreateMessage: customToCreateMessage,
    cancelPendingToolCallsOnSend = true,
  }: MastraAISDKRuntimeAdapter = {},
) {
  const contextAdapters = useRuntimeAdapters();
  const [toolStatuses, setToolStatuses] = useState<
    Record<string, ToolExecutionStatus>
  >({});
  const toolArgsKeyOrderCache = useMemo(
    () => new Map<string, Map<string, string[]>>(),
    [],
  );
  const lastRunConfigRef = useRef<RunConfig | undefined>(undefined);

  const hasExecutingTools = Object.values(toolStatuses).some(
    (s) => s?.type === "executing",
  );
  const isRunning =
    chatHelpers.status === "submitted" ||
    chatHelpers.status === "streaming" ||
    hasExecutingTools;

  const messageTiming = useStreamingTiming(chatHelpers.messages, isRunning);

  const messages = AISDKMessageConverter.useThreadMessages({
    isRunning,
    messages: chatHelpers.messages,
    metadata: useMemo(
      () => ({
        toolStatuses,
        messageTiming,
        toolArgsKeyOrderCache,
        ...(chatHelpers.error && { error: chatHelpers.error.message }),
      }),
      [toolStatuses, messageTiming, toolArgsKeyOrderCache, chatHelpers.error],
    ),
  });

  const [runtimeRef] = useState(() => ({
    get current(): AssistantRuntime {
      return runtime;
    },
  }));

  const toolInvocations = useToolInvocations({
    state: {
      messages,
      isRunning,
    },
    getTools: () => runtimeRef.current.thread.getModelContext().tools,
    onResult: (command) => {
      if (command.type === "add-tool-result") {
        chatHelpers.addToolResult({
          tool: command.toolName,
          toolCallId: command.toolCallId,
          output: command.result,
          options: { metadata: lastRunConfigRef.current },
        });
      }
    },
    setToolStatuses,
  });

  const isLoading = useExternalHistory(
    runtimeRef,
    adapters?.history ?? contextAdapters?.history,
    AISDKMessageConverter.toThreadMessages as (
      messages: UI_MESSAGE[],
    ) => ThreadMessage[],
    aiSDKV6FormatAdapter as MessageFormatAdapter<
      UI_MESSAGE,
      AISDKStorageFormat
    >,
    (next) => {
      chatHelpers.setMessages(next);
    },
  );

  const completePendingToolCalls = async () => {
    if (!cancelPendingToolCallsOnSend) return;

    await toolInvocations.abort();

    chatHelpers.setMessages((prev) => {
      const lastMessage = prev.at(-1);
      if (lastMessage?.role !== "assistant") return prev;

      let hasChanges = false;
      const parts = lastMessage.parts?.map((part) => {
        if (!isToolUIPart(part)) return part;
        if (part.state === "output-available" || part.state === "output-error")
          return part;

        hasChanges = true;
        return {
          ...part,
          state: "output-error" as const,
          errorText: "User cancelled tool call by sending a new message.",
        };
      });

      if (!hasChanges) return prev;
      return [...prev.slice(0, -1), { ...lastMessage, parts }];
    });
  };

  const resolveServerToolApproval = (
    toolCallId: string,
    payload: ApprovalResumePayload,
  ): boolean => {
    const rid = normalizeToolCallIdForApproval;
    const msgs = chatHelpers.messages;

    let foundIndex = -1;
    let approvalId: string | undefined;

    for (let i = msgs.length - 1; i >= 0; i--) {
      const message = msgs[i];
      if (message?.role !== "assistant" || !message.parts) continue;

      const part = message.parts.find(
        (p) =>
          isToolUIPart(p) &&
          rid(p.toolCallId) === rid(toolCallId) &&
          p.state === "approval-requested",
      );

      if (
        part &&
        isToolUIPart(part) &&
        part.state === "approval-requested" &&
        "approval" in part
      ) {
        foundIndex = i;
        approvalId = part.approval.id;
        break;
      }
    }

    if (foundIndex < 0 || approvalId === undefined) return false;

    if (foundIndex === msgs.length - 1) {
      void chatHelpers.addToolApprovalResponse({
        id: approvalId,
        approved: payload.approved,
        reason: payload.reason,
      });
      return true;
    }

    const nextMessages = msgs.map((m, idx) => {
      if (idx !== foundIndex || m.role !== "assistant" || !m.parts) return m;
      return {
        ...m,
        parts: m.parts.map((p) => {
          if (
            !isToolUIPart(p) ||
            rid(p.toolCallId) !== rid(toolCallId) ||
            p.state !== "approval-requested" ||
            p.approval.id !== approvalId
          ) {
            return p;
          }
          return {
            ...p,
            state: "approval-responded" as const,
            approval: {
              id: approvalId,
              approved: payload.approved,
              reason: payload.reason,
            },
          };
        }),
      } as UI_MESSAGE;
    });

    chatHelpers.setMessages(nextMessages);

    if (chatHelpers.status !== "streaming" && chatHelpers.status !== "submitted") {
      void chatHelpers.sendMessage(undefined, {
        metadata: lastRunConfigRef.current,
      });
    }

    return true;
  };

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages,
    setMessages: (next) =>
      chatHelpers.setMessages(
        next
          .map(getVercelAIMessages<UI_MESSAGE>)
          .filter(Boolean)
          .flat(),
      ),
    onImport: (next) =>
      chatHelpers.setMessages(
        next
          .map(getVercelAIMessages<UI_MESSAGE>)
          .filter(Boolean)
          .flat(),
      ),
    onExportExternalState: (): MessageFormatRepository<UI_MESSAGE> => {
      const exported = runtimeRef.current.thread.export();

      const expandedMessages: MessageFormatItem<UI_MESSAGE>[] = [];
      const lastInnerIdMap = new Map<string, string>();

      for (const item of exported.messages) {
        const innerMessages = getExternalStoreMessages<UI_MESSAGE>(
          item.message,
        );
        let parentId =
          item.parentId != null
            ? (lastInnerIdMap.get(item.parentId) ?? item.parentId)
            : null;
        for (const innerMessage of innerMessages) {
          expandedMessages.push({ parentId, message: innerMessage });
          parentId = aiSDKV6FormatAdapter.getId(innerMessage as UIMessage);
        }
        if (innerMessages.length > 0) {
          lastInnerIdMap.set(
            item.message.id,
            aiSDKV6FormatAdapter.getId(
              innerMessages[innerMessages.length - 1]! as UIMessage,
            ),
          );
        }
      }

      const result: MessageFormatRepository<UI_MESSAGE> = {
        messages: expandedMessages,
      };

      if (exported.headId != null) {
        result.headId = lastInnerIdMap.get(exported.headId) ?? exported.headId;
      }

      return result;
    },
    onLoadExternalState: (repo: MessageFormatRepository<UI_MESSAGE>) => {
      const exportedRepo = toExportedMessageRepository(
        AISDKMessageConverter.toThreadMessages,
        repo,
      );
      runtimeRef.current.thread.import(exportedRepo);
    },
    onCancel: async () => {
      chatHelpers.stop();
      await toolInvocations.abort();
    },
    onNew: async (message) => {
      lastRunConfigRef.current = message.runConfig;
      await completePendingToolCalls();

      const createMessage = (
        customToCreateMessage ?? toCreateMessage
      )<UI_MESSAGE>(message);
      await chatHelpers.sendMessage(createMessage, {
        metadata: message.runConfig,
      });
    },
    onEdit: async (message) => {
      lastRunConfigRef.current = message.runConfig;
      const newMessages = sliceMessagesUntil(
        chatHelpers.messages,
        message.parentId,
      );
      chatHelpers.setMessages(newMessages);

      const createMessage = (
        customToCreateMessage ?? toCreateMessage
      )<UI_MESSAGE>(message);
      await chatHelpers.sendMessage(createMessage, {
        metadata: message.runConfig,
      });
    },
    onReload: async (parentId: string | null, config) => {
      lastRunConfigRef.current = config.runConfig;
      const newMessages = sliceMessagesUntil(chatHelpers.messages, parentId);
      chatHelpers.setMessages(newMessages);

      await chatHelpers.regenerate({ metadata: config.runConfig });
    },
    onAddToolResult: ({ toolCallId, result, isError }) => {
      const options = { metadata: lastRunConfigRef.current };
      if (isError) {
        chatHelpers.addToolOutput({
          state: "output-error",
          tool: toolCallId,
          toolCallId,
          errorText:
            typeof result === "string" ? result : JSON.stringify(result),
          options,
        });
      } else {
        chatHelpers.addToolOutput({
          state: "output-available",
          tool: toolCallId,
          toolCallId,
          output: result,
          options,
        });
      }
    },
    onResumeToolCall: (options) => {
      const payload = options.payload as ApprovalResumePayload;
      if (
        payload &&
        typeof payload === "object" &&
        "approved" in payload &&
        typeof payload.approved === "boolean" &&
        resolveServerToolApproval(options.toolCallId, payload)
      ) {
        return;
      }
      toolInvocations.resume(options.toolCallId, options.payload);
    },
    adapters: {
      attachments: vercelAttachmentAdapter,
      ...contextAdapters,
      ...adapters,
    },
    isLoading,
  });

  return runtime;
}
