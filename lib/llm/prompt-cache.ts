/**
 * Tier S #4: Prompt cache —— 让重复 system prompt 的 token 不再每轮都付费。
 *
 * 不同 provider 的 prompt cache 机制不同，这里提供一个统一的薄层：
 *
 * - **Gemini Flash / Pro（implicit prefix cache）**：当 system prompt 前缀
 *   在多轮里 byte-identical 且超过 ~1024 tokens（Flash）/ ~4096 tokens（Pro）时，
 *   自动复用缓存。我们做了 prompts/agents/*.md → loadAgentPrompt() 的切分，
 *   prompt 前缀本身就是稳定的，implicit cache 已经在工作。
 *
 * - **Gemini explicit cachedContents**：>= 32K tokens 才能创建。本项目当前
 *   system prompt 各 ~1.5–2k tokens，远不够阈值；先保留 stub，等 prompt 长起来再启用。
 *
 * - **Anthropic Claude（cacheControl: ephemeral）**：在 system / tool 定义结尾打
 *   cache breakpoint，连续 5 分钟内的同 prefix 请求按缓存价（10%）计费。
 *   通过 `providerOptions.anthropic.cacheControl` 注入。
 *
 * 这个模块只负责：① 估 token、② 决定要不要给 providerOptions 加 cacheControl、
 * ③ 启动时打一行日志，告诉运维 prompt cache 是哪种状态。
 */

const APPROX_TOKENS_PER_CHAR = 1 / 3.5;

export function estimatePromptTokens(text: string): number {
  return Math.ceil(text.length * APPROX_TOKENS_PER_CHAR);
}

export type ProviderFamily = "google" | "anthropic" | "openai" | "other";

export function inferProviderFamily(modelId: string): ProviderFamily {
  const id = modelId.toLowerCase();
  if (id.startsWith("google/") || id.startsWith("gemini")) return "google";
  if (id.startsWith("anthropic/") || id.startsWith("claude")) return "anthropic";
  if (
    id.startsWith("openai/") ||
    id.startsWith("gpt-") ||
    id.startsWith("o1") ||
    id.startsWith("o3") ||
    id.startsWith("deepseek") || // DeepSeek：OpenAI 兼容 API → 归入 openai 隐式缓存路径
    id.startsWith("glm-") ||
    id.startsWith("glm/") ||
    id.startsWith("zhipu")
  ) {
    return "openai";
  }
  return "other";
}

export type PromptCacheStrategy =
  | { kind: "gemini-implicit"; thresholdTokens: number }
  | { kind: "gemini-explicit-stub"; minTokens: number }
  | { kind: "anthropic-cache-control" }
  | { kind: "openai-implicit" }
  | { kind: "none" };

const GEMINI_IMPLICIT_FLASH_THRESHOLD = 1024;
const GEMINI_EXPLICIT_MIN = 32_768;

export function pickCacheStrategy(args: {
  modelId: string;
  promptTokens: number;
}): PromptCacheStrategy {
  const family = inferProviderFamily(args.modelId);
  if (family === "anthropic") return { kind: "anthropic-cache-control" };
  if (family === "google") {
    if (args.promptTokens >= GEMINI_EXPLICIT_MIN) {
      return { kind: "gemini-explicit-stub", minTokens: GEMINI_EXPLICIT_MIN };
    }
    return {
      kind: "gemini-implicit",
      thresholdTokens: GEMINI_IMPLICIT_FLASH_THRESHOLD,
    };
  }
  if (family === "openai") return { kind: "openai-implicit" };
  return { kind: "none" };
}

/**
 * 给 Mastra Agent 的 providerOptions 传入合适的 cacheControl。
 * 当前只对 Anthropic 有效；Gemini implicit cache 自动生效，无需 provider option。
 */
export function buildProviderCacheOptions(
  strategy: PromptCacheStrategy,
): Record<string, unknown> | undefined {
  if (strategy.kind === "anthropic-cache-control") {
    return {
      anthropic: {
        cacheControl: { type: "ephemeral" },
      },
    };
  }
  return undefined;
}

const seenPromptIds = new Set<string>();

/** 启动时按 agent 打一次 log，提示当前 prompt 走的是哪种 cache 路径。 */
export function logPromptCacheStatus(args: {
  promptId: string;
  modelId: string;
  promptText: string;
}): void {
  if (seenPromptIds.has(args.promptId)) return;
  seenPromptIds.add(args.promptId);
  const tokens = estimatePromptTokens(args.promptText);
  const strategy = pickCacheStrategy({
    modelId: args.modelId,
    promptTokens: tokens,
  });
  const human = describeStrategy(strategy);
  // eslint-disable-next-line no-console
  console.info(
    `[prompt-cache] ${args.promptId} model=${args.modelId} ~${tokens} tokens → ${human}`,
  );
}

function describeStrategy(s: PromptCacheStrategy): string {
  switch (s.kind) {
    case "gemini-implicit":
      return `Gemini implicit prefix cache (auto when prefix stable & >= ${s.thresholdTokens} tokens)`;
    case "gemini-explicit-stub":
      return `Gemini explicit cachedContents (>= ${s.minTokens} tokens; create via REST API to enable)`;
    case "anthropic-cache-control":
      return "Anthropic cache_control: ephemeral (5min, ~10% price)";
    case "openai-implicit":
      return "OpenAI implicit prompt caching (auto)";
    case "none":
      return "no cache (unrecognized provider)";
  }
}

export function __resetPromptCacheLogForTests(): void {
  seenPromptIds.clear();
}
