"use client";

import type { EmptyMessagePartProps } from "@assistant-ui/react";
import { Loader2 } from "lucide-react";

/** Visible placeholder while the assistant message has no parts yet (e.g. network / model latency). */
export function AssistantMessageEmpty({ status }: EmptyMessagePartProps) {
  if (status.type !== "running") {
    return null;
  }

  return (
    <p className="flex items-center gap-2 text-[15px] leading-relaxed text-muted-foreground">
      <Loader2
        className="size-4 shrink-0 animate-spin"
        aria-hidden
      />
      <span>正在思考…</span>
    </p>
  );
}
