import { getOutingTodoRepo } from "@/src/infra/repos";
import { renderOutingTodos as render } from "@/src/infra/repos/json/outing-todos-repo";

export type {
  OutingTodoItem,
  OutingTodoStatus,
} from "@/src/infra/repos/types";

import type { OutingTodoItem } from "@/src/infra/repos/types";

/** RequestContext key set from chat body `id` in app/api/chat/route.ts */
export const OUTING_CHAT_THREAD_ID_KEY = "outingChatThreadId";

export const renderOutingTodos = render;

export function setOutingTodos(
  threadKey: string,
  items: OutingTodoItem[],
): { items: OutingTodoItem[]; markdown: string } {
  const repo = getOutingTodoRepo();
  repo.set(threadKey, items);
  return { items: repo.get(threadKey), markdown: repo.rendered(threadKey) };
}
