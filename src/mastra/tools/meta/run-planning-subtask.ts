import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import { RequestContext } from "@mastra/core/di";
import { OUTING_CHAT_THREAD_ID_KEY } from "@/lib/chat/server/outing-todo-store";
import { z } from "zod";

const runPlanningSubtaskInputSchema = z.object({
  objective: z
    .string()
    .min(8)
    .max(12_000)
    .describe(
      "子任务目标：要查清/排好什么（独立可读，勿依赖主会话专有指代）。例如：「在 inferred adcode 310106 下按预算 500 搜亲子半日点并给出 3 个候选 POI 与理由」。",
    ),
  hints: z
    .string()
    .max(6000)
    .optional()
    .describe(
      "可选：父 Agent 掌握的简短事实（adcode、日期、人数、已得 poi_id 等），勿粘贴整段用户原话。",
    ),
});

const runPlanningSubtaskOutputSchema = z.object({
  summary: z.string(),
  finish_reason: z.string().optional(),
  sub_thread_id: z.string(),
});

function subagentMaxSteps(): number {
  const raw = process.env.PLANNING_SUBAGENT_MAX_STEPS;
  if (raw == null || raw === "") return 12;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 32 ? n : 12;
}

function capSummary(text: string, max = 28_000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n…(summary truncated for parent context)`;
}

export const runPlanningSubtaskTool = createTool({
  id: "run_planning_subtask",
  description:
    "s04 Subagent：把「大块调研/多工具探路」放到**独立空上下文**里跑，只把简短总结带回主对话，避免主线程消息爆炸。适合：多区域比选、长链路搜点+算路预研、与用户最终方案无关的中间验证。**不要**用它做最终对用户定稿（定稿仍在主会话完成）；子任务内同样禁止 execute 类能力。",
  inputSchema: runPlanningSubtaskInputSchema,
  outputSchema: runPlanningSubtaskOutputSchema,
  execute: async (input, context: ToolExecutionContext<unknown, unknown, unknown>) => {
    const mastra = context.mastra;
    if (!mastra) {
      throw new Error("Mastra 实例不可用，无法启动子 Agent。");
    }
    const worker = mastra.getAgentById("planningWorkerAgent");
    const subThreadId = `sub_${crypto.randomUUID()}`;
    const subRc = new RequestContext();
    subRc.set(OUTING_CHAT_THREAD_ID_KEY, subThreadId);

    const body = [
      "## 子任务",
      input.objective.trim(),
      input.hints?.trim()
        ? `\n## 父 Agent 提供的 hints\n${input.hints.trim()}`
        : "",
      "\n请用工具完成目标，最后用一段中文总结要点（含 poi_id / 时间窗 / 预算结论等）。",
    ].join("\n");

    const result = await worker.generate(body, {
      maxSteps: subagentMaxSteps(),
      requestContext: subRc,
      abortSignal: context.abortSignal,
    });

    return {
      summary: capSummary((result.text ?? "").trim() || "(子任务未产生文本总结)"),
      finish_reason: result.finishReason,
      sub_thread_id: subThreadId,
    };
  },
});
