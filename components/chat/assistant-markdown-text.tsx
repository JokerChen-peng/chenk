"use client";

import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";

/** Strips legacy/internal planning blocks the model was prompted to emit (see planning-agent). */
function stripPlanningScratchpad(text: string): string {
  let t = text.replace(
    /<planning_scratchpad>[\s\S]*?<\/planning_scratchpad>/gi,
    "",
  );
  const open = /<planning_scratchpad>/i.exec(t);
  if (open) {
    t = t.slice(0, open.index);
  }
  return t;
}

/** Renders assistant text parts as Markdown (lists, bold, code) for cleaner summaries. */
export function AssistantMarkdownText() {
  return (
    <MarkdownTextPrimitive
      preprocess={stripPlanningScratchpad}
      className="aui-md max-w-none text-[15px] leading-relaxed text-foreground [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_strong]:font-semibold [&_code]:rounded-md [&_code]:bg-muted/80 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/60 [&_pre]:bg-muted/30 [&_pre]:p-3 [&_blockquote]:border-l-2 [&_blockquote]:border-[#FFC300]/70 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
    />
  );
}
