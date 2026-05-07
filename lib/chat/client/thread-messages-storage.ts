import type { UIMessage } from "@ai-sdk/react";

const STORAGE_KEY = "meituan-assistant.thread-messages.v1";

type Store = Record<string, UIMessage[]>;

function readAll(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

function writeAll(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

export function readThreadMessages(threadKey: string): UIMessage[] {
  const all = readAll();
  const v = all[threadKey];
  return Array.isArray(v) ? v : [];
}

export function writeThreadMessages(
  threadKey: string,
  messages: UIMessage[],
): void {
  const all = readAll();
  all[threadKey] = messages;
  writeAll(all);
}

export function deleteThreadMessages(threadKey: string): void {
  const all = readAll();
  if (!(threadKey in all)) return;
  delete all[threadKey];
  writeAll(all);
}

export function migrateThreadMessages(fromKey: string, toKey: string): void {
  if (fromKey === toKey) return;
  const all = readAll();
  const from = all[fromKey];
  if (!Array.isArray(from) || from.length === 0) return;
  if (Array.isArray(all[toKey]) && all[toKey]!.length > 0) return;
  all[toKey] = from;
  delete all[fromKey];
  writeAll(all);
}
