import type { OutingTodoItem, OutingTodoRepo } from "@/src/infra/repos/types";

/** 用 Map 实现的进程内 todo 仓储；不持久化（demo 即可，生产可换 Redis） */
export class InMemoryOutingTodoRepo implements OutingTodoRepo {
  private store = new Map<string, OutingTodoItem[]>();

  set(threadId: string, items: OutingTodoItem[]): void {
    this.store.set(threadId, [...items]);
  }

  get(threadId: string): OutingTodoItem[] {
    return [...(this.store.get(threadId) ?? [])];
  }

  rendered(threadId: string): string {
    return renderOutingTodos(this.get(threadId));
  }
}

export function renderOutingTodos(items: OutingTodoItem[]): string {
  const lines: string[] = [];
  for (const item of items) {
    const marker =
      item.status === "completed"
        ? "[x]"
        : item.status === "in_progress"
          ? "[>]"
          : "[ ]";
    lines.push(`${marker} ${item.text} (#${item.id})`);
  }
  const done = items.filter((t) => t.status === "completed").length;
  lines.push("");
  lines.push(`进度：${done}/${items.length} 已完成`);
  return lines.join("\n");
}
