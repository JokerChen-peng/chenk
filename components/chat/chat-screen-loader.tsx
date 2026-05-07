"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";

function ChatLoadingFallback() {
  return (
    <div className="mx-auto flex h-[85vh] w-full max-w-6xl items-center justify-center rounded-2xl border border-border/60 bg-muted/20 text-sm text-muted-foreground">
      加载对话…
    </div>
  );
}

const ChatScreen = dynamic(() => import("@/components/chat/chat-screen"), {
  ssr: false,
  loading: ChatLoadingFallback,
});

/** Client-only entry: `next/dynamic` with `ssr: false` must live in a Client Component (Next.js 16+). */
export function ChatScreenLoader() {
  return (
    <Suspense fallback={<ChatLoadingFallback />}>
      <ChatScreen />
    </Suspense>
  );
}
