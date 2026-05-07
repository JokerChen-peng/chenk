import fs from "node:fs";
import path from "node:path";
import { logPromptCacheStatus } from "@/lib/llm/prompt-cache";
import { getAgentModelLabelForLogging } from "@/src/infra/agent-model";

/**
 * 在模块初始化时把 prompts/agents/<name>.md 同步读出来。
 *
 * - 同步 fs 是有意为之：agent 实例需要在文件 import 时立刻拿到 instructions。
 *   反正这只在服务端 Node.js 进程里执行，Edge / Browser 不会跑到。
 * - 文件不存在 / 读取失败时直接抛错；和静态字符串相比唯一变化是改文本不用碰 .ts。
 * - 顺便对应 agent 名称记一行 prompt cache 状态（首次加载时），方便在
 *   `npm run dev` 启动日志里立刻确认每个 agent 的缓存策略对得上。
 */
export function loadAgentPrompt(
  name: string,
  opts?: { modelId?: string },
): string {
  const file = path.join(process.cwd(), "prompts", "agents", `${name}.md`);
  const raw = fs.readFileSync(file, "utf8");
  const text = raw.trim();
  const modelId = opts?.modelId ?? getAgentModelLabelForLogging();
  try {
    logPromptCacheStatus({ promptId: name, modelId, promptText: text });
  } catch {
    // logging 不阻塞 prompt 加载
  }
  return text;
}
