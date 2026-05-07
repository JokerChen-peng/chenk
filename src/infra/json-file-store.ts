import fs from "node:fs/promises";
import path from "node:path";

/**
 * 通用 JSON 文件存储基础设施。所有 .data/*.json 都走这一层，未来想换 LibSQL /
 * Postgres / Redis 只需要换这个文件的实现就行。
 *
 * - 文件不存在时返回 defaults（不抛 ENOENT）
 * - JSON 解析失败时也返回 defaults，避免一个坏文件把整个 demo 卡死
 * - 写入是"读 → 改 → 全量重写"，单进程演示足够，多进程要换实现
 */
export function createJsonFileStore<T>(args: {
  fileName: string;
  defaults: () => T;
  /** 校验从磁盘读出来的 JSON shape；返回 false 时回退 defaults */
  validate?: (raw: unknown) => raw is T;
}) {
  const { fileName, defaults, validate } = args;

  function dataDir(): string {
    return path.join(process.cwd(), ".data");
  }
  function storePath(): string {
    return path.join(dataDir(), fileName);
  }
  async function ensureDir(): Promise<void> {
    await fs.mkdir(dataDir(), { recursive: true });
  }

  async function read(): Promise<T> {
    try {
      const raw = await fs.readFile(storePath(), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (validate && !validate(parsed)) return defaults();
      return (parsed as T) ?? defaults();
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") return defaults();
      // SyntaxError / 其他读盘异常都回退到 defaults
      if (err instanceof SyntaxError) return defaults();
      throw e;
    }
  }

  async function write(next: T): Promise<void> {
    await ensureDir();
    await fs.writeFile(storePath(), JSON.stringify(next, null, 2), "utf8");
  }

  /** 读 → 修改 → 写 的便捷封装 */
  async function update(mut: (current: T) => T | Promise<T>): Promise<T> {
    const current = await read();
    const next = await mut(current);
    await write(next);
    return next;
  }

  return { read, write, update, storePath };
}

export type JsonFileStore<T> = ReturnType<typeof createJsonFileStore<T>>;
