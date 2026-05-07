/**
 * 统一仓储接口（抽象掉文件 / DB / Redis 等存储介质）。
 *
 * 当前只有一个 JsonFile 实现（dev/demo 用），但所有业务代码只引用接口；
 * 未来想上 LibSQL / Postgres，加一个新 impl 切换 default 工厂即可。
 *
 * 所有仓储相关的领域类型也在这里定义；上层 lib/plans / lib/notifications /
 * lib/share / lib/chat/server/outing-todo-store 都从这里 re-export。
 */

import type {
  OperationLine,
  OperationResult,
  TransactionAction,
} from "@/src/mastra/tools/execution/transaction-schema";

// ── 持久化定稿行程 ──────────────────────────────────────

export type SavedOutingPlanSegment = {
  segment_id: string;
  kind: string;
  label: string;
  poi_id?: string;
  start_time_iso: string;
  end_time_iso: string;
  estimated_cost_cny?: number;
  notes?: string;
};

export type SavedOutingPlan = {
  id: string;
  title: string;
  savedAt: string;
  segments: SavedOutingPlanSegment[];
  /** 自增版本号，每次 upsert 同一 id 会 +1 */
  version: number;
  /** 父快照 snapshot id，用于回滚链 */
  parent_snapshot_id?: string;
  total_estimated_cost_cny?: number;
  budget_total_cny?: number;
};

export type PlanSnapshot = SavedOutingPlan & {
  /** 每次保存的快照独立 id */
  snapshot_id: string;
};

// ── 交易审计 ───────────────────────────────────────────

export type AuditedOperation = {
  poi_id: string;
  action_type: TransactionAction;
  mock_order_ref: string;
  idempotency_key: string;
  amount_cny?: number;
  applied_discount_cny?: number;
  related_segment_id?: string;
  label?: string;
  notes?: string;
  /** 完整 OperationLine 快照，便于 UI 重建出 reservation/delivery/taxi 详情 */
  raw: OperationLine;
};

export type AuditedBundle = {
  bundle_id: string;
  thread_id?: string;
  created_at: string;
  message?: string;
  results: AuditedOperation[];
  /** ISO; rollbackBundle 之后会写入，UI 据此显示「已撤销」徽章 */
  rolled_back_at?: string;
  rollback_reason?: string;
};

// ── 通知中心 ───────────────────────────────────────────

export type NotificationKind =
  | "reminder"
  | "share_delivery"
  | "transaction"
  | "weather_alert"
  | "system";

export type NotificationEntry = {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  fire_at_iso?: string;
  created_at: string;
  thread_id?: string;
  read: boolean;
};

// ── 分享反馈 ───────────────────────────────────────────

export type ShareFeedbackEntry = {
  id: string;
  token: string;
  reaction: "thumbs_up" | "thumbs_down" | "neutral";
  comment?: string;
  reviewer_label?: string;
  created_at: string;
};

// ── todo（in-memory，跨轮次共享） ───────────────────────

export type OutingTodoStatus = "pending" | "in_progress" | "completed";
export type OutingTodoItem = {
  id: string;
  text: string;
  status: OutingTodoStatus;
};

// ── 接口 ──────────────────────────────────────────────

export interface PlanRepo {
  list(): Promise<SavedOutingPlan[]>;
  get(id: string): Promise<SavedOutingPlan | null>;
  upsert(
    plan: Omit<SavedOutingPlan, "savedAt" | "version"> &
      Partial<Pick<SavedOutingPlan, "savedAt" | "version" | "parent_snapshot_id">>,
  ): Promise<SavedOutingPlan>;
  updateTitle(id: string, title: string): Promise<SavedOutingPlan | null>;
  delete(id: string): Promise<boolean>;
  listSnapshots(id: string): Promise<PlanSnapshot[]>;
  rollback(args: {
    id: string;
    snapshot_id: string;
  }): Promise<SavedOutingPlan | null>;
}

export interface TransactionRepo {
  recordBundle(args: {
    bundle_id: string;
    thread_id?: string;
    message?: string;
    operations: OperationLine[];
    results: OperationResult[];
  }): Promise<AuditedBundle>;
  list(): Promise<AuditedBundle[]>;
  /**
   * 一键撤销整个 bundle。
   * - 已撤销的 bundle 直接返回原值（幂等）。
   * - Mock 实现：标记 rolled_back_at + rollback_reason，不真正删除审计记录，
   *   实际生产环境中应该调用对应 vendor API（取消预订 / 退款 / 取消打车）。
   */
  rollbackBundle(args: {
    bundle_id: string;
    reason?: string;
  }): Promise<AuditedBundle | null>;
}

export interface NotificationRepo {
  append(
    entry: Omit<NotificationEntry, "id" | "created_at" | "read"> &
      Partial<Pick<NotificationEntry, "id" | "created_at" | "read">>,
  ): Promise<NotificationEntry>;
  list(): Promise<NotificationEntry[]>;
  markRead(ids: string[]): Promise<number>;
}

export interface ShareFeedbackRepo {
  append(args: {
    token: string;
    reaction: ShareFeedbackEntry["reaction"];
    comment?: string;
    reviewer_label?: string;
  }): Promise<ShareFeedbackEntry>;
  listForToken(token: string): Promise<ShareFeedbackEntry[]>;
  listAll(): Promise<ShareFeedbackEntry[]>;
}

export interface OutingTodoRepo {
  set(threadId: string, items: OutingTodoItem[]): void;
  get(threadId: string): OutingTodoItem[];
  rendered(threadId: string): string;
}
