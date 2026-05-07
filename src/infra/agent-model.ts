import { createOpenAI } from "@ai-sdk/openai";

/** Mastra 魔法串：走 Google（Vercel AI Gateway / Mastra 内置解析） */
const DEFAULT_GEMINI_ROUTER_ID = "google/gemini-3.1-flash-lite-preview";

const DEFAULT_GLM_MODEL = "glm-4.5-air";
const DEFAULT_GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function providerName(): string {
  const explicit = firstNonEmpty(process.env.AGENT_PROVIDER, process.env.LLM_PROVIDER);
  if (explicit) return explicit.toLowerCase();

  if (firstNonEmpty(process.env.GLM_API_KEY, process.env.ZHIPUAI_API_KEY)) {
    return "glm";
  }

  if (firstNonEmpty(process.env.DEEPSEEK_API_KEY)) {
    return "deepseek";
  }

  return "google";
}

/**
 * 所有 Agent 共用的底层模型：
 * - **google**（默认）：`GEMINI_MODEL` 或默认 `google/gemini-3.1-flash-lite-preview`
 * - **glm**：`GLM_API_KEY`（或 `ZHIPUAI_API_KEY`）+ OpenAI 兼容 /v4，默认 `glm-4.5-air`
 * - **deepseek**：`@ai-sdk/openai` 的兼容模式，`DEEPSEEK_API_KEY` + 官方 `/v1`
 */
export function resolveAgentModel() {
  if (providerName() === "glm") {
    const apiKey = firstNonEmpty(process.env.GLM_API_KEY, process.env.ZHIPUAI_API_KEY);
    if (!apiKey) {
      console.warn(
        "[agent-model] AGENT_PROVIDER=glm 但未设置 GLM_API_KEY / ZHIPUAI_API_KEY，回退到 Gemini。",
      );
      return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_ROUTER_ID;
    }
    const baseURL = process.env.GLM_BASE_URL?.trim() ?? DEFAULT_GLM_BASE_URL;
    const modelId = process.env.GLM_MODEL?.trim() ?? DEFAULT_GLM_MODEL;
    const glm = createOpenAI({
      name: "glm",
      baseURL,
      apiKey,
    });
    return glm.chat(modelId);
  }

  if (providerName() === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      console.warn(
        "[agent-model] AGENT_PROVIDER=deepseek 但未设置 DEEPSEEK_API_KEY，回退到 Gemini。",
      );
      return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_ROUTER_ID;
    }
    const baseURL =
      process.env.DEEPSEEK_BASE_URL?.trim() ?? "https://api.deepseek.com/v1";
    const modelId = process.env.DEEPSEEK_MODEL?.trim() ?? "deepseek-chat";
    const ds = createOpenAI({
      name: "deepseek",
      baseURL,
      apiKey,
    });
    return ds(modelId);
  }

  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_ROUTER_ID;
}

/** 给 `prompts/load.ts`、日志用：字符串形式的 model id，非 LanguageModel 实例。 */
export function getAgentModelLabelForLogging(): string {
  if (providerName() === "glm") {
    const m = process.env.GLM_MODEL?.trim() ?? DEFAULT_GLM_MODEL;
    return `glm/${m}`;
  }
  if (providerName() === "deepseek") {
    const m = process.env.DEEPSEEK_MODEL?.trim() ?? "deepseek-chat";
    return `deepseek/${m}`;
  }
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_ROUTER_ID;
}
