import { createUIMessageStream, type UIMessage } from "ai";

/**
 * 离线 demo：当 MOCK_AGENT=1 时，chat API 不连真模型，直接吐一段固定文案。
 * 用于无 API key 时演示前端 UI / 路由 / share / notification / saved-plan 等闭环。
 */
export function buildMockAgentStream(args: {
  agentId: "planningAgent" | "executionAgent";
  lastUserText: string;
}) {
  const { agentId, lastUserText } = args;

  const planningResponse = `已收到你的需求：「${lastUserText.slice(0, 80)}${
    lastUserText.length > 80 ? "…" : ""
  }」

\`MOCK_AGENT=1\` 离线模式下我不会调真实模型，但你已经可以走完以下闭环：

1. 跑命令行 demo：\`npm run demo:family\` 或 \`npm run demo:friends\`，会串行调用所有规划工具并输出真实 mock 数据。
2. 在「我的方案」页面里手动新建一条计划（或重放 demo），再去 \`/share/<token>\` 给「老婆」点赞、留言。
3. 在「我下过的单」页面里看 \`.data/transactions.json\` 中已落库的 mock 订单。
4. 关掉 \`MOCK_AGENT=1\`、配置 OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY 后即可走真模型。

如果你想要更逼真的对话体验，请：
- 在终端 \`MOCK_AGENT=0 npm run dev\` 启动；
- 或直接用 \`npm run demo:family\` 看完整工具链。`;

  const executionResponse = `\`MOCK_AGENT=1\` 离线模式 · 执行 Agent 已收到「${lastUserText.slice(
    0,
    60,
  )}${lastUserText.length > 60 ? "…" : ""}」。

为了保持演示安全，离线模式下不会真的调用 \`execute_transaction\` / \`execute_transaction_batch\`。要看一键多笔卡片：

- 直接跑 \`npm run demo:family\`，CLI 末尾会把 batch 落到 \`.data/transactions.json\`。
- 或关闭 \`MOCK_AGENT\`、走真模型，规划 → 你说「确认下单」时会触发 approval 卡片。`;

  const text = agentId === "executionAgent" ? executionResponse : planningResponse;

  return createUIMessageStream<UIMessage>({
    async execute({ writer }) {
      const messageId = `mock-${Date.now()}`;
      writer.write({ type: "start", messageId });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: "t1" });
      // 拆成几次 chunk 模拟流
      const chunks = text.match(/[\s\S]{1,80}/g) ?? [text];
      for (const c of chunks) {
        writer.write({ type: "text-delta", id: "t1", delta: c });
      }
      writer.write({ type: "text-end", id: "t1" });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish" });
    },
  });
}

export function isMockAgentMode(): boolean {
  return process.env.MOCK_AGENT === "1";
}
