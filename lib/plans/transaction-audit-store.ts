import { getTransactionRepo } from "@/src/infra/repos";

export type {
  AuditedBundle,
  AuditedOperation,
} from "@/src/infra/repos/types";

import type { AuditedBundle } from "@/src/infra/repos/types";
import type {
  OperationLine,
  OperationResult,
} from "@/src/mastra/tools/execution/transaction-schema";

export async function recordBundle(args: {
  bundle_id: string;
  thread_id?: string;
  message?: string;
  operations: OperationLine[];
  results: OperationResult[];
}): Promise<AuditedBundle> {
  return getTransactionRepo().recordBundle(args);
}

export async function listAuditedBundles(): Promise<AuditedBundle[]> {
  return getTransactionRepo().list();
}

export async function rollbackBundle(args: {
  bundle_id: string;
  reason?: string;
}): Promise<AuditedBundle | null> {
  return getTransactionRepo().rollbackBundle(args);
}
