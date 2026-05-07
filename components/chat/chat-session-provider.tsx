"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { useMastraChatRuntime } from "@/lib/chat/client/use-mastra-chat-runtime";
import { useMemo, type ReactNode } from "react";
import { readHomeAdcodeHint } from "@/components/chat/home-location-pill";

/**
 * Keeps Mastra / Assistant UI chat state alive across client navigations
 * (e.g. home → 我的方案 → home) so messages are not cleared.
 */
export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: async (options) => {
          const home_adcode_hint = readHomeAdcodeHint();
          const baseBody = (options.body ?? {}) as Record<string, unknown>;
          const baseRc = (baseBody.requestContext ?? {}) as Record<string, unknown>;
          const requestContext = home_adcode_hint
            ? { ...baseRc, home_adcode_hint }
            : baseRc;
          return {
            body: {
              ...baseBody,
              id: options.id,
              messages: options.messages,
              trigger: options.trigger,
              messageId: options.messageId,
              metadata: options.requestMetadata,
              requestContext,
            },
          };
        },
      }),
    [],
  );
  const runtime = useMastraChatRuntime({
    transport,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
