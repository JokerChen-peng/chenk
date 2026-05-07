import type {
  RemoteThreadInitializeResponse,
  RemoteThreadListAdapter,
  RemoteThreadListResponse,
  RemoteThreadMetadata,
} from "@assistant-ui/core";
import type { AssistantStream, AssistantStreamChunk } from "assistant-stream";
import { deleteThreadMessages } from "@/lib/chat/client/thread-messages-storage";

const STORAGE_KEY = "meituan-assistant.thread-list.v1";

type ThreadRow = {
  remoteId: string;
  title: string;
  status: "regular" | "archived";
  updatedAt: string;
};

type StoreFile = { v: 1; threads: ThreadRow[] };

function emptyStore(): StoreFile {
  return { v: 1, threads: [] };
}

function readStore(): StoreFile {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("threads" in parsed) ||
      !Array.isArray((parsed as StoreFile).threads)
    ) {
      return emptyStore();
    }
    return parsed as StoreFile;
  } catch {
    return emptyStore();
  }
}

function writeStore(store: StoreFile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

function newRemoteId(): string {
  return crypto.randomUUID();
}

/**
 * Thread list + metadata in localStorage (browser). Implements Assistant UI
 * {@link RemoteThreadListAdapter} for multi-session without Assistant Cloud.
 */
export class PersistedThreadListAdapter implements RemoteThreadListAdapter {
  private readonly pendingLocalToRemote = new Map<string, string>();

  async list(): Promise<RemoteThreadListResponse> {
    const { threads } = readStore();
    const meta: RemoteThreadMetadata[] = threads.map((t) => ({
      remoteId: t.remoteId,
      title: t.title,
      status: t.status,
      externalId: undefined,
    }));
    return { threads: meta };
  }

  async rename(remoteId: string, newTitle: string): Promise<void> {
    const store = readStore();
    const idx = store.threads.findIndex((t) => t.remoteId === remoteId);
    if (idx < 0) return;
    store.threads[idx] = {
      ...store.threads[idx]!,
      title: newTitle,
      updatedAt: new Date().toISOString(),
    };
    writeStore(store);
  }

  async archive(remoteId: string): Promise<void> {
    const store = readStore();
    const idx = store.threads.findIndex((t) => t.remoteId === remoteId);
    if (idx < 0) return;
    store.threads[idx] = {
      ...store.threads[idx]!,
      status: "archived",
      updatedAt: new Date().toISOString(),
    };
    writeStore(store);
  }

  async unarchive(remoteId: string): Promise<void> {
    const store = readStore();
    const idx = store.threads.findIndex((t) => t.remoteId === remoteId);
    if (idx < 0) return;
    store.threads[idx] = {
      ...store.threads[idx]!,
      status: "regular",
      updatedAt: new Date().toISOString(),
    };
    writeStore(store);
  }

  async delete(remoteId: string): Promise<void> {
    const store = readStore();
    store.threads = store.threads.filter((t) => t.remoteId !== remoteId);
    writeStore(store);
    deleteThreadMessages(remoteId);
  }

  async initialize(
    threadId: string,
  ): Promise<RemoteThreadInitializeResponse> {
    if (!threadId.startsWith("__LOCALID_")) {
      return { remoteId: threadId, externalId: undefined };
    }
    const cached = this.pendingLocalToRemote.get(threadId);
    if (cached) {
      return { remoteId: cached, externalId: undefined };
    }
    const remoteId = newRemoteId();
    this.pendingLocalToRemote.set(threadId, remoteId);
    const store = readStore();
    const title = "新对话";
    store.threads.unshift({
      remoteId,
      title,
      status: "regular",
      updatedAt: new Date().toISOString(),
    });
    writeStore(store);
    return { remoteId, externalId: undefined };
  }

  async generateTitle(): Promise<AssistantStream> {
    return Promise.resolve(
      new ReadableStream<AssistantStreamChunk>(),
    ) as Promise<AssistantStream>;
  }

  async fetch(threadId: string): Promise<RemoteThreadMetadata> {
    const store = readStore();
    const t = store.threads.find((x) => x.remoteId === threadId);
    if (!t) {
      throw new Error("Thread not found");
    }
    return {
      remoteId: t.remoteId,
      title: t.title,
      status: t.status,
      externalId: undefined,
    };
  }
}
