import { Agent } from "@mastra/core/agent";
import {
  applyCouponTool,
  compactSessionContextTool,
  executeTransactionBatchTool,
  executeTransactionTool,
  loadOutingSkillTool,
  mockPayViaMeituanWalletTool,
  modifyReservationTool,
  shareOutingSummaryTool,
  writeOutingTodosTool,
} from "@/src/mastra/tools";
import { loadAgentPrompt } from "@/prompts/load";
import { resolveAgentModel } from "@/src/infra/agent-model";
import { getSharedMemory } from "@/src/infra/mastra-memory";

const EXECUTION_AGENT_SYSTEM_PROMPT = loadAgentPrompt("execution-agent");

export const executionAgent = new Agent({
  id: "executionAgent",
  name: "Local Life Execution Agent",
  instructions: EXECUTION_AGENT_SYSTEM_PROMPT,
  model: resolveAgentModel(),
  memory: getSharedMemory(),
  tools: {
    write_outing_todos: writeOutingTodosTool,
    compact_session_context: compactSessionContextTool,
    load_outing_skill: loadOutingSkillTool,
    apply_coupon: applyCouponTool,
    execute_transaction: executeTransactionTool,
    execute_transaction_batch: executeTransactionBatchTool,
    modify_reservation: modifyReservationTool,
    mock_pay_via_meituan_wallet: mockPayViaMeituanWalletTool,
    share_outing_summary: shareOutingSummaryTool,
  },
  defaultGenerateOptionsLegacy: {
    maxSteps: 12,
  },
  defaultStreamOptionsLegacy: {
    maxSteps: 12,
  },
});
