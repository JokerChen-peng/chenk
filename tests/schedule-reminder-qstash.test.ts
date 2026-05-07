import { describe, expect, it, beforeEach, vi } from "vitest";
import { __setReposForTests, __resetReposForTests } from "@/src/infra/repos";
import type {
  NotificationEntry,
  NotificationRepo,
} from "@/src/infra/repos/types";

class InMemoryNotifRepo implements NotificationRepo {
  items: NotificationEntry[] = [];
  async append(
    entry: Omit<NotificationEntry, "id" | "created_at" | "read"> &
      Partial<Pick<NotificationEntry, "id" | "created_at" | "read">>,
  ): Promise<NotificationEntry> {
    const e: NotificationEntry = {
      id: entry.id ?? `n-${this.items.length + 1}`,
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      fire_at_iso: entry.fire_at_iso,
      thread_id: entry.thread_id,
      created_at: entry.created_at ?? new Date().toISOString(),
      read: entry.read ?? false,
    };
    this.items.push(e);
    return e;
  }
  async list() {
    return [...this.items];
  }
  async markRead(ids: string[]) {
    let n = 0;
    for (const it of this.items) {
      if (ids.includes(it.id) && !it.read) {
        it.read = true;
        n += 1;
      }
    }
    return n;
  }
}

vi.mock("@/lib/jobs/qstash", () => ({
  scheduleReminderViaQstash: vi.fn(),
}));

import { scheduleReminderTool } from "@/src/mastra/tools/follow-up/schedule-reminder";
import { scheduleReminderViaQstash } from "@/lib/jobs/qstash";

describe("scheduleReminderTool", () => {
  let repo: InMemoryNotifRepo;
  beforeEach(() => {
    repo = new InMemoryNotifRepo();
    __setReposForTests({ notification: repo });
    vi.mocked(scheduleReminderViaQstash).mockReset();
  });

  type ToolResult = {
    scheduled: Array<{
      id: string;
      title: string;
      fire_at_iso: string;
      qstash_message_id?: string;
    }>;
    message: string;
    delivery: "mock_only" | "qstash_scheduled";
  };

  async function run(
    reminders: { title: string; body?: string; fire_at_iso: string }[],
  ): Promise<ToolResult> {
    const raw = await scheduleReminderTool.execute!(
      { reminders } as never,
      { requestContext: undefined } as never,
    );
    if (!raw || typeof raw !== "object" || !("delivery" in raw)) {
      throw new Error("schedule_reminder returned validation error: " + JSON.stringify(raw));
    }
    return raw as unknown as ToolResult;
  }

  it("falls back to mock_only when QStash is not configured", async () => {
    vi.mocked(scheduleReminderViaQstash).mockResolvedValue(null);
    const out = await run([
      { title: "出发提醒", fire_at_iso: "2030-01-01T05:00:00Z" },
    ]);
    expect(out.delivery).toBe("mock_only");
    expect(out.scheduled).toHaveLength(1);
    expect(out.scheduled[0]!.qstash_message_id).toBeUndefined();
    expect(repo.items).toHaveLength(1);
    __resetReposForTests();
  });

  it("returns qstash_scheduled with the message id when QStash answers", async () => {
    vi.mocked(scheduleReminderViaQstash).mockImplementation(
      async ({ notification_id, fire_at_iso }) => ({
        notification_id,
        qstash_message_id: `msg-${notification_id}`,
        fire_at_iso,
      }),
    );
    const out = await run([
      { title: "提前到位", fire_at_iso: "2030-01-01T06:00:00Z" },
      { title: "结束清场", fire_at_iso: "2030-01-01T10:00:00Z" },
    ]);
    expect(out.delivery).toBe("qstash_scheduled");
    expect(out.scheduled).toHaveLength(2);
    expect(out.scheduled[0]!.qstash_message_id).toMatch(/^msg-/);
    expect(out.scheduled[1]!.qstash_message_id).toMatch(/^msg-/);
    __resetReposForTests();
  });

  it("survives QStash throwing — still records the notification", async () => {
    vi.mocked(scheduleReminderViaQstash).mockRejectedValue(
      new Error("network down"),
    );
    const out = await run([
      { title: "网络挂了", fire_at_iso: "2030-01-01T05:00:00Z" },
    ]);
    expect(out.delivery).toBe("mock_only");
    expect(repo.items).toHaveLength(1);
    __resetReposForTests();
  });
});
