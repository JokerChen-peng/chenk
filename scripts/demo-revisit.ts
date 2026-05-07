#!/usr/bin/env tsx
/**
 * Demo —— Mastra Memory + LibSQL 跨"会话/进程"持久化示例。
 *
 * 这个脚本验证 Tier S #1（持久 storage）的真实价值：
 *   1. 第一次"小明"用 user@local 邮箱来规划一次家庭周末活动，关键摘要写入 thread metadata。
 *   2. 模拟"下周再来"——重置内存里的 Memory 单例（相当于重启进程 / 跨会话）。
 *   3. 第二次启动后，仅凭 resourceId 就能找到上次的 thread + 摘要，
 *      可以直接说"上次给你订的是 X，这周要不要换个 Y"。
 *
 * 用法：
 *   npm run demo:revisit
 */

import {
  __resetSharedMemoryForTests,
  getSharedMemory,
} from "@/src/infra/mastra-memory";

const RESOURCE_ID = "user@local"; // 同一邮箱即同一 user
const THREAD_ID = "demo-revisit-thread-001";
const TITLE = "家庭周末半日行";

type RevisitMeta = {
  last_outing_summary?: string;
  last_restaurant?: string;
  last_window?: string;
};

async function firstVisit() {
  process.stdout.write("\n[VISIT 1] 小明第一次规划，把摘要写到 thread metadata…\n");
  const memory = getSharedMemory();
  const now = new Date();
  await memory.saveThread({
    thread: {
      id: THREAD_ID,
      title: TITLE,
      resourceId: RESOURCE_ID,
      createdAt: now,
      updatedAt: now,
      metadata: {
        last_outing_summary:
          "上海静安 · 4 小时家庭半日行：绿光森林亲子餐厅 + 静安公园 citywalk + 蛋糕送达",
        last_restaurant: "rest-jingan-001",
        last_window: "2026-05-02 14:00–18:00",
      } satisfies RevisitMeta,
    },
  });
  process.stdout.write(
    `         √ thread saved (id=${THREAD_ID}, resourceId=${RESOURCE_ID})\n`,
  );
}

async function secondVisit() {
  process.stdout.write(
    "\n[VISIT 2] 模拟跨进程：重置 Memory 单例（相当于下周重新启动），仅凭 resourceId 召回…\n",
  );
  __resetSharedMemoryForTests();
  const memory = getSharedMemory();
  const recalled = await memory.getThreadById({ threadId: THREAD_ID });
  if (!recalled) {
    throw new Error("Memory recall failed: thread not found");
  }
  if (recalled.resourceId !== RESOURCE_ID) {
    throw new Error(
      `Memory recall scoped wrong: got resource=${recalled.resourceId}`,
    );
  }
  const meta = (recalled.metadata ?? {}) as RevisitMeta;
  process.stdout.write(
    `         √ recalled thread "${recalled.title}" (resourceId=${recalled.resourceId})\n`,
  );
  process.stdout.write(`         · 上次摘要：${meta.last_outing_summary}\n`);
  process.stdout.write(`         · 上次订座：${meta.last_restaurant}\n`);
  process.stdout.write(`         · 上次时间窗：${meta.last_window}\n`);
  process.stdout.write(
    "\n[AGENT REPLY MOCK] 上次小明带家人去过『绿光森林亲子餐厅』。这次给你换『轻盐沙拉工坊』试试 → search_enhanced_poi(exclude=[rest-jingan-001])\n",
  );
}

async function main() {
  console.log("============ Memory Revisit Demo ============");
  await firstVisit();
  await secondVisit();
  console.log("\n============ DONE ============");
  console.log(
    "（清理：rm -rf .data/memory.db 即可重置；不删则下次仍能召回这条 thread。）",
  );
}

void main().catch((e) => {
  console.error("revisit demo failed:", e);
  process.exitCode = 1;
});
