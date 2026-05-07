import { Mastra } from "@mastra/core";
import { executionAgent } from "@/src/mastra/agents/execution-agent";
import { planningAgent } from "@/src/mastra/agents/planning-agent";
import { planningWorkerAgent } from "@/src/mastra/agents/planning-subworker-agent";
import { getSharedStorage } from "@/src/infra/mastra-memory";

/**
 * 用 LibSQL 作为 Mastra 底层 storage（workflow/agent run snapshots、Memory 读写
 * 共用同一份 .data/memory.db）。配上 `memory: getSharedMemory()` 的 agent，
 * 跨会话历史、resume / 工具审批 snapshot 都自动持久化。
 */
export const mastra = new Mastra({
  storage: getSharedStorage(),
  agents: {
    planningAgent,
    planningWorkerAgent,
    executionAgent,
  },
});
