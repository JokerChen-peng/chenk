import { createJsonFileStore } from "@/src/infra/json-file-store";
import type {
  AuditedBundle,
  AuditedOperation,
  TransactionRepo,
} from "@/src/infra/repos/types";

type StoreFile = { bundles: AuditedBundle[] };

const store = createJsonFileStore<StoreFile>({
  fileName: "transactions.json",
  defaults: () => ({ bundles: [] }),
  validate: (raw): raw is StoreFile =>
    !!raw &&
    typeof raw === "object" &&
    Array.isArray((raw as Partial<StoreFile>).bundles),
});

export class JsonFileTransactionRepo implements TransactionRepo {
  async list(): Promise<AuditedBundle[]> {
    const { bundles } = await store.read();
    return bundles;
  }

  async recordBundle(args: {
    bundle_id: string;
    thread_id?: string;
    message?: string;
    operations: import("@/src/mastra/tools/execution/transaction-schema").OperationLine[];
    results: import("@/src/mastra/tools/execution/transaction-schema").OperationResult[];
  }): Promise<AuditedBundle> {
    let audited!: AuditedBundle;
    await store.update((cur) => {
      const created_at = new Date().toISOString();
      const operations: AuditedOperation[] = args.results.map((r, i) => ({
        poi_id: r.poi_id,
        action_type: r.action_type,
        mock_order_ref: r.mock_order_ref,
        idempotency_key: r.idempotency_key,
        amount_cny: r.amount_cny,
        applied_discount_cny: r.applied_discount_cny,
        related_segment_id: r.related_segment_id,
        label: r.label,
        notes: r.notes,
        raw: args.operations[i]!,
      }));
      audited = {
        bundle_id: args.bundle_id,
        thread_id: args.thread_id,
        created_at,
        message: args.message,
        results: operations,
      };
      cur.bundles.unshift(audited);
      if (cur.bundles.length > 200) cur.bundles.length = 200;
      return cur;
    });
    return audited;
  }

  async rollbackBundle(args: {
    bundle_id: string;
    reason?: string;
  }): Promise<AuditedBundle | null> {
    let updated: AuditedBundle | null = null;
    await store.update((cur) => {
      const idx = cur.bundles.findIndex((b) => b.bundle_id === args.bundle_id);
      if (idx < 0) return cur;
      const orig = cur.bundles[idx]!;
      if (orig.rolled_back_at) {
        updated = orig;
        return cur;
      }
      const next: AuditedBundle = {
        ...orig,
        rolled_back_at: new Date().toISOString(),
        rollback_reason: args.reason ?? "用户在 /transactions 一键撤销",
      };
      cur.bundles[idx] = next;
      updated = next;
      return cur;
    });
    return updated;
  }
}
