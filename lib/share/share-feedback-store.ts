import { getShareFeedbackRepo } from "@/src/infra/repos";

export type { ShareFeedbackEntry } from "@/src/infra/repos/types";

import type { ShareFeedbackEntry } from "@/src/infra/repos/types";

export async function appendFeedback(args: {
  token: string;
  reaction: ShareFeedbackEntry["reaction"];
  comment?: string;
  reviewer_label?: string;
}): Promise<ShareFeedbackEntry> {
  return getShareFeedbackRepo().append(args);
}

export async function listFeedbackForToken(
  token: string,
): Promise<ShareFeedbackEntry[]> {
  return getShareFeedbackRepo().listForToken(token);
}

export async function listAllFeedback(): Promise<ShareFeedbackEntry[]> {
  return getShareFeedbackRepo().listAll();
}
