import { createJsonFileStore } from "@/src/infra/json-file-store";
import type {
  ShareFeedbackEntry,
  ShareFeedbackRepo,
} from "@/src/infra/repos/types";

type StoreFile = { feedback: ShareFeedbackEntry[] };

const store = createJsonFileStore<StoreFile>({
  fileName: "share-feedback.json",
  defaults: () => ({ feedback: [] }),
  validate: (raw): raw is StoreFile =>
    !!raw &&
    typeof raw === "object" &&
    Array.isArray((raw as Partial<StoreFile>).feedback),
});

export class JsonFileShareFeedbackRepo implements ShareFeedbackRepo {
  async listAll(): Promise<ShareFeedbackEntry[]> {
    const { feedback } = await store.read();
    return feedback;
  }

  async listForToken(token: string): Promise<ShareFeedbackEntry[]> {
    const { feedback } = await store.read();
    return feedback.filter((f) => f.token === token);
  }

  async append(args: {
    token: string;
    reaction: ShareFeedbackEntry["reaction"];
    comment?: string;
    reviewer_label?: string;
  }): Promise<ShareFeedbackEntry> {
    let entry!: ShareFeedbackEntry;
    await store.update((cur) => {
      entry = {
        id: crypto.randomUUID(),
        token: args.token,
        reaction: args.reaction,
        comment: args.comment?.slice(0, 400),
        reviewer_label: args.reviewer_label?.slice(0, 40),
        created_at: new Date().toISOString(),
      };
      cur.feedback.unshift(entry);
      if (cur.feedback.length > 1000) cur.feedback.length = 1000;
      return cur;
    });
    return entry;
  }
}
