import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, getToolName, isToolUIPart, type UIMessage } from "ai";

const DEFAULT_KEEP_RECENT_TOOL_OUTPUTS = 12;
const DEFAULT_MIN_TOOL_OUTPUT_CHARS = 180;
const DEFAULT_AUTO_COMPACT_UTF8 = 96_000;
const DEFAULT_TAIL_MESSAGES = 6;

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function estimateMessagesUtf8(messages: UIMessage[]): number {
  try {
    return new TextEncoder().encode(JSON.stringify(messages)).length;
  } catch {
    return 0;
  }
}

function jsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

type ToolSlot = { mi: number; pi: number; toolName: string };

function collectLargeToolOutputSlots(messages: UIMessage[]): ToolSlot[] {
  const keepNames = new Set(["compact_session_context"]);
  const slots: ToolSlot[] = [];
  for (let mi = 0; mi < messages.length; mi++) {
    const m = messages[mi];
    if (m.role !== "assistant" || !m.parts) continue;
    for (let pi = 0; pi < m.parts.length; pi++) {
      const p = m.parts[pi];
      if (!isToolUIPart(p)) continue;
      const toolName = getToolName(p);
      if (keepNames.has(toolName)) continue;
      const minChars = envInt("CONTEXT_COMPACT_MIN_TOOL_CHARS", DEFAULT_MIN_TOOL_OUTPUT_CHARS);
      if (p.state === "output-available" && p.output !== undefined) {
        if (jsonByteLength(p.output) >= minChars) {
          slots.push({ mi, pi, toolName });
        }
      } else if (p.state === "output-error" && p.errorText) {
        if (p.errorText.length >= minChars) {
          slots.push({ mi, pi, toolName });
        }
      }
    }
  }
  return slots;
}

/**
 * Layer 1 (micro): keep the last N large tool outputs; older ones become tiny placeholders.
 */
export function microCompactUIMessages(messages: UIMessage[]): {
  messages: UIMessage[];
  changed: boolean;
} {
  const out = structuredClone(messages) as UIMessage[];
  const keep = envInt("CONTEXT_COMPACT_KEEP_TOOL_OUTPUTS", DEFAULT_KEEP_RECENT_TOOL_OUTPUTS);
  const slots = collectLargeToolOutputSlots(out);
  if (slots.length <= keep) return { messages: out, changed: false };

  const drop = slots.slice(0, slots.length - keep);
  for (const s of drop) {
    const msg = out[s.mi];
    if (!msg?.parts) continue;
    const part = msg.parts[s.pi];
    if (!isToolUIPart(part)) continue;
    if (part.state === "output-available") {
      (part as { output?: unknown }).output = {
        __context_micro_compact: true,
        tool: s.toolName,
        note: `[Earlier output omitted (${s.toolName})]`,
      };
    } else if (part.state === "output-error") {
      (part as { errorText?: string }).errorText = `[Earlier error omitted (${s.toolName})]`;
    }
  }
  return { messages: out, changed: true };
}

export async function writeCompactionTranscript(
  threadKey: string,
  messages: unknown[],
  reason: "auto_compact" | "manual_compact",
): Promise<string> {
  const dir = path.join(process.cwd(), ".data", "transcripts");
  await mkdir(dir, { recursive: true });
  const safe = threadKey.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 96);
  const fileName = `${safe}-${Date.now()}-${reason}.json`;
  const fp = path.join(dir, fileName);
  const payload = {
    savedAt: new Date().toISOString(),
    reason,
    threadKey,
    messages,
  };
  await writeFile(fp, JSON.stringify(payload, null, 2), "utf8");
  return fileName;
}

export async function summarizeMessagesForCompaction(
  contextBlob: string,
): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey?.trim()) {
    return "[摘要未生成：未配置 GOOGLE_GENERATIVE_AI_API_KEY；已仅做工具输出占位压缩。]";
  }
  const modelId =
    process.env.CONTEXT_COMPACT_SUMMARY_MODEL ?? "gemini-2.0-flash-lite";
  const google = createGoogleGenerativeAI({ apiKey });
  const { text } = await generateText({
    model: google(modelId),
    maxOutputTokens: 2500,
    prompt: `你是「上下文压缩」助手。下面是一段 App 对话的 JSON（可能已截断），请写成给后续规划/执行 Agent 用的**高密度中文摘要**。
务必保留：用户目标、人数/预算/时间窗、关键 adcode 或区域、已确认的 poi_id、未完成动作、最近错误原因。
省略：大段工具原始 JSON、重复寒暄。

对话 JSON：
${contextBlob}`,
  });
  return text.trim();
}

async function autoCompactUIMessages(
  messages: UIMessage[],
  threadKey: string,
): Promise<{ messages: UIMessage[]; transcriptFile: string }> {
  const tailN = envInt("CONTEXT_COMPACT_TAIL_MESSAGES", DEFAULT_TAIL_MESSAGES);
  let tail = messages.slice(-tailN);
  let head = messages.slice(0, Math.max(0, messages.length - tail.length));
  if (head.length === 0 && messages.length > 2) {
    tail = messages.slice(-2);
    head = messages.slice(0, -2);
  }
  if (head.length === 0) {
    const blob = JSON.stringify(messages).slice(0, 92_000);
    const summary = await summarizeMessagesForCompaction(blob);
    const transcriptFile = await writeCompactionTranscript(
      threadKey,
      messages,
      "auto_compact",
    );
    const summaryMessage: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [
        {
          type: "text",
          text: `[上下文已自动压缩 s06]\n整段对话较短但 payload 很大；以下为摘要。\n\n${summary}`,
        },
      ],
    };
    return { messages: [summaryMessage], transcriptFile };
  }
  const headBlob = JSON.stringify(head).slice(0, 92_000);
  const summary = await summarizeMessagesForCompaction(headBlob);
  const transcriptFile = await writeCompactionTranscript(threadKey, messages, "auto_compact");

  const summaryMessage: UIMessage = {
    id: crypto.randomUUID(),
    role: "user",
    parts: [
      {
        type: "text",
        text: `[上下文已自动压缩 s06]\n以下摘要替代较早轮次；末尾 ${tail.length} 条消息保持原样。\n\n${summary}`,
      },
    ],
  };

  return { messages: [summaryMessage, ...tail], transcriptFile };
}

export type ContextCompactionMeta = {
  appliedMicro: boolean;
  appliedAuto: boolean;
  charsBefore: number;
  charsAfterMicro: number;
  charsAfter: number;
  transcriptFile?: string;
};

/**
 * s06：先 micro（每请求），体积仍超阈值则 auto（摘要 + 保留尾部 + 写 .data/transcripts）。
 */
export async function compactMessagesForAgentRequest(
  messages: UIMessage[],
  threadKey: string,
): Promise<{ messages: UIMessage[]; meta: ContextCompactionMeta }> {
  const charsBefore = estimateMessagesUtf8(messages);
  const { messages: micro, changed: appliedMicro } =
    microCompactUIMessages(messages);
  const charsAfterMicro = estimateMessagesUtf8(micro);
  const threshold = envInt(
    "CONTEXT_COMPACT_AUTO_UTF8",
    DEFAULT_AUTO_COMPACT_UTF8,
  );

  let result = micro;
  let appliedAuto = false;
  let transcriptFile: string | undefined;

  if (charsAfterMicro > threshold) {
    const ac = await autoCompactUIMessages(micro, threadKey);
    result = ac.messages;
    transcriptFile = ac.transcriptFile;
    appliedAuto = true;
  }

  const meta: ContextCompactionMeta = {
    appliedMicro,
    appliedAuto,
    charsBefore,
    charsAfterMicro,
    charsAfter: estimateMessagesUtf8(result),
    transcriptFile,
  };

  return { messages: result, meta };
}
