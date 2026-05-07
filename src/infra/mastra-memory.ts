import path from "node:path";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";

/**
 * Tier S #1: Mastra Memory + LibSQL —— 跨会话记忆与持久化 storage。
 *
 * - 同一份 LibSQLStore 同时给 Mastra (workflow / agent run snapshots) 和
 *   Memory (thread / message / observational memory) 用，避免双写。
 * - URL 默认 file:./.data/memory.db；上线只要把 LIBSQL_URL 换成 turso://...
 *   并设 LIBSQL_AUTH_TOKEN 即可，业务代码无需改动。
 * - 不开 vector / semantic recall（避免给 demo 加 embedding 调用），
 *   等需要 "上次去过哪、再换地方" 这类语义召回时打开 retrieval.vector 即可。
 */

function defaultLibsqlUrl(): string {
  const fromEnv = process.env.LIBSQL_URL?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return `file:${path.join(process.cwd(), ".data", "memory.db")}`;
}

let _storage: LibSQLStore | null = null;
let _memory: Memory | null = null;

export function getSharedStorage(): LibSQLStore {
  if (_storage) return _storage;
  _storage = new LibSQLStore({
    id: "meituan-storage",
    url: defaultLibsqlUrl(),
    authToken: process.env.LIBSQL_AUTH_TOKEN,
  });
  return _storage;
}

export function getSharedMemory(): Memory {
  if (_memory) return _memory;
  _memory = new Memory({
    storage: getSharedStorage(),
    options: {
      lastMessages: 12,
      semanticRecall: false,
      generateTitle: false,
      workingMemory: { enabled: false, template: "" },
    },
  });
  return _memory;
}

/** 测试 / 重启场景下：清掉单例，下次再 lazy 创建 */
export function __resetSharedMemoryForTests(): void {
  _storage = null;
  _memory = null;
}
