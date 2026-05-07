"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import type { AssistantRuntime } from "@assistant-ui/core";
import {
  useCloudThreadListAdapter,
  useRemoteThreadListRuntime,
} from "@assistant-ui/core/react";
import { useAuiState } from "@assistant-ui/store";
import { AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import type { AssistantCloud } from "assistant-cloud";
import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type ChatInit,
} from "ai";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useChatErrorBannerStore } from "./chat-error-banner-store";
import {
  useMastraAISDKRuntime,
  type MastraAISDKRuntimeAdapter,
  type CustomToCreateMessageFunction,
} from "./mastra-aisdk-runtime";
import { PersistedThreadListAdapter } from "./persisted-thread-list-adapter";
import {
  migrateThreadMessages,
  readThreadMessages,
  writeThreadMessages,
} from "./thread-messages-storage";

export type UseMastraChatRuntimeOptions<
  UI_MESSAGE extends UIMessage = UIMessage,
> = ChatInit<UI_MESSAGE> & {
  cloud?: AssistantCloud | undefined;
  adapters?: MastraAISDKRuntimeAdapter["adapters"] | undefined;
  toCreateMessage?: CustomToCreateMessageFunction;
};

const useMastraChatThreadRuntime = <UI_MESSAGE extends UIMessage = UIMessage>(
  options?: UseMastraChatRuntimeOptions<UI_MESSAGE>,
): AssistantRuntime => {
  const {
    adapters,
    transport: transportOptions,
    toCreateMessage,
    sendAutomaticallyWhen: userSendAutomaticallyWhen,
    onFinish: userOnFinish,
    ...chatOptions
  } = options ?? {};

  const [fallbackTransport] = useState(() => new AssistantChatTransport());
  const rawTransport = transportOptions ?? fallbackTransport;

  const threadItem = useAuiState((s) => s.threadListItem);
  const id = threadItem.id;
  const threadRef = useRef(threadItem);
  useLayoutEffect(() => {
    threadRef.current = threadItem;
  }, [threadItem]);

  const storageKey = threadItem.remoteId ?? threadItem.id;
  const initialMessages = useMemo(
    () => readThreadMessages(storageKey) as UI_MESSAGE[],
    [storageKey],
  );

  const chat = useChat<UI_MESSAGE>({
    ...chatOptions,
    id,
    messages: initialMessages,
    transport: rawTransport,
    sendAutomaticallyWhen: ({ messages }) => {
      if (lastAssistantMessageIsCompleteWithApprovalResponses({ messages })) {
        return true;
      }
      return userSendAutomaticallyWhen?.({ messages }) ?? false;
    },
    onFinish: (info) => {
      userOnFinish?.(info);
      const t = threadRef.current;
      writeThreadMessages(t.remoteId ?? t.id, info.messages);
    },
  });

  /**
   * 关键：在 `chat.messages` 任何一次变更时都把当前快照写盘，而不仅仅是
   * `onFinish`。否则当一个新会话刚分到 `remoteId`（即 threadItem.remoteId
   * 从 undefined 变成 uuid）时，下面那个 reload effect 会用 `setMessages`
   * 把还在飞的用户/助手消息擦掉——因为 `__LOCALID_xxx` 这个 key 在磁盘上
   * 还没东西。先写盘再迁移就能在升级 remoteId 时无缝把消息端过去。
   */
  useEffect(() => {
    if (chat.messages.length === 0) return;
    const t = threadRef.current;
    writeThreadMessages(t.remoteId ?? t.id, chat.messages);
  }, [chat.messages]);

  useEffect(() => {
    const localId = threadItem.id;
    const remoteId = threadItem.remoteId;
    if (remoteId && localId.startsWith("__LOCALID_")) {
      migrateThreadMessages(localId, remoteId);
    }
    const key = remoteId ?? localId;
    const persisted = readThreadMessages(key) as UI_MESSAGE[];

    // 安全网：如果内存里已经有比磁盘更新的消息（比如刚发出的那条还在流中），
    // 就别重置，反过来把内存快照写盘，避免擦掉用户的第一条消息。
    if (chat.messages.length > persisted.length) {
      writeThreadMessages(key, chat.messages);
      return;
    }
    chat.setMessages(persisted);
    // Only reload when thread identity changes; `chat` is intentionally omitted (unstable).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- threadItem.id / remoteId drive reload
  }, [threadItem.id, threadItem.remoteId]);

  useEffect(() => {
    useChatErrorBannerStore.getState().setFromChatError(
      chat.error ?? undefined,
      () => chat.clearError?.(),
    );
  }, [chat.error, chat.clearError]); // eslint-disable-line react-hooks/exhaustive-deps -- whole `chat` is unstable

  const runtime = useMastraAISDKRuntime(chat, {
    adapters,
    ...(toCreateMessage && { toCreateMessage }),
  });

  if (rawTransport instanceof AssistantChatTransport) {
    rawTransport.setRuntime(runtime);
  }

  return runtime;
};

export function useMastraChatRuntime<
  UI_MESSAGE extends UIMessage = UIMessage,
>({
  cloud,
  ...options
}: UseMastraChatRuntimeOptions<UI_MESSAGE> = {}): AssistantRuntime {
  const cloudAdapter = useCloudThreadListAdapter({ cloud });
  const persistedListAdapter = useMemo(
    () => new PersistedThreadListAdapter(),
    [],
  );
  const listAdapter = cloud != null ? cloudAdapter : persistedListAdapter;

  return useRemoteThreadListRuntime({
    runtimeHook: function RuntimeHook() {
      return useMastraChatThreadRuntime(options);
    },
    adapter: listAdapter,
    allowNesting: true,
  });
}
