import { getNotificationRepo } from "@/src/infra/repos";

export type {
  NotificationEntry,
  NotificationKind,
} from "@/src/infra/repos/types";

import type { NotificationEntry } from "@/src/infra/repos/types";

export async function appendNotification(
  entry: Omit<NotificationEntry, "id" | "created_at" | "read"> &
    Partial<Pick<NotificationEntry, "id" | "created_at" | "read">>,
): Promise<NotificationEntry> {
  return getNotificationRepo().append(entry);
}

export async function listNotifications(): Promise<NotificationEntry[]> {
  return getNotificationRepo().list();
}

export async function markNotificationsRead(ids: string[]): Promise<number> {
  return getNotificationRepo().markRead(ids);
}
