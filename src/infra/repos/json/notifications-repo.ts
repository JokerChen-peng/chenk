import { createJsonFileStore } from "@/src/infra/json-file-store";
import type {
  NotificationEntry,
  NotificationRepo,
} from "@/src/infra/repos/types";

type StoreFile = { notifications: NotificationEntry[] };

const store = createJsonFileStore<StoreFile>({
  fileName: "notifications.json",
  defaults: () => ({ notifications: [] }),
  validate: (raw): raw is StoreFile =>
    !!raw &&
    typeof raw === "object" &&
    Array.isArray((raw as Partial<StoreFile>).notifications),
});

export class JsonFileNotificationRepo implements NotificationRepo {
  async list(): Promise<NotificationEntry[]> {
    const { notifications } = await store.read();
    return notifications;
  }

  async append(
    entry: Omit<NotificationEntry, "id" | "created_at" | "read"> &
      Partial<Pick<NotificationEntry, "id" | "created_at" | "read">>,
  ): Promise<NotificationEntry> {
    let full!: NotificationEntry;
    await store.update((cur) => {
      full = {
        id: entry.id ?? crypto.randomUUID(),
        created_at: entry.created_at ?? new Date().toISOString(),
        read: entry.read ?? false,
        kind: entry.kind,
        title: entry.title,
        body: entry.body,
        fire_at_iso: entry.fire_at_iso,
        thread_id: entry.thread_id,
      };
      cur.notifications.unshift(full);
      if (cur.notifications.length > 500) cur.notifications.length = 500;
      return cur;
    });
    return full;
  }

  async markRead(ids: string[]): Promise<number> {
    let count = 0;
    await store.update((cur) => {
      for (const n of cur.notifications) {
        if (ids.includes(n.id) && !n.read) {
          n.read = true;
          count++;
        }
      }
      return cur;
    });
    return count;
  }
}
