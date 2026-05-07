/**
 * 默认仓储工厂。整个 demo 的 default 实现是 JSON 文件 + 进程内内存。
 *
 * - 替换为 LibSQL / Postgres / Redis 实现时，只需要改这里指向新 impl，
 *   业务代码（lib/plans / lib/notifications / lib/share / 工具）拿到的还是
 *   src/infra/repos/types 里那几个接口，不需要任何改动。
 * - 单测里可以注入 in-memory mock，不再依赖文件 IO。
 */

import { JsonFilePlanRepo } from "./json/plans-repo";
import { JsonFileTransactionRepo } from "./json/transactions-repo";
import { JsonFileNotificationRepo } from "./json/notifications-repo";
import { JsonFileShareFeedbackRepo } from "./json/share-feedback-repo";
import { InMemoryOutingTodoRepo } from "./json/outing-todos-repo";
import type {
  NotificationRepo,
  OutingTodoRepo,
  PlanRepo,
  ShareFeedbackRepo,
  TransactionRepo,
} from "./types";

let planRepo: PlanRepo | null = null;
let transactionRepo: TransactionRepo | null = null;
let notificationRepo: NotificationRepo | null = null;
let shareFeedbackRepo: ShareFeedbackRepo | null = null;
let outingTodoRepo: OutingTodoRepo | null = null;

export function getPlanRepo(): PlanRepo {
  if (!planRepo) planRepo = new JsonFilePlanRepo();
  return planRepo;
}

export function getTransactionRepo(): TransactionRepo {
  if (!transactionRepo) transactionRepo = new JsonFileTransactionRepo();
  return transactionRepo;
}

export function getNotificationRepo(): NotificationRepo {
  if (!notificationRepo) notificationRepo = new JsonFileNotificationRepo();
  return notificationRepo;
}

export function getShareFeedbackRepo(): ShareFeedbackRepo {
  if (!shareFeedbackRepo) shareFeedbackRepo = new JsonFileShareFeedbackRepo();
  return shareFeedbackRepo;
}

export function getOutingTodoRepo(): OutingTodoRepo {
  if (!outingTodoRepo) outingTodoRepo = new InMemoryOutingTodoRepo();
  return outingTodoRepo;
}

/** 测试 / 自定义场景用：注入替代实现 */
export function __setReposForTests(args: {
  plan?: PlanRepo;
  transaction?: TransactionRepo;
  notification?: NotificationRepo;
  shareFeedback?: ShareFeedbackRepo;
  outingTodo?: OutingTodoRepo;
}): void {
  if (args.plan) planRepo = args.plan;
  if (args.transaction) transactionRepo = args.transaction;
  if (args.notification) notificationRepo = args.notification;
  if (args.shareFeedback) shareFeedbackRepo = args.shareFeedback;
  if (args.outingTodo) outingTodoRepo = args.outingTodo;
}

export function __resetReposForTests(): void {
  planRepo = null;
  transactionRepo = null;
  notificationRepo = null;
  shareFeedbackRepo = null;
  outingTodoRepo = null;
}

export type {
  AuditedBundle,
  AuditedOperation,
  NotificationEntry,
  NotificationKind,
  NotificationRepo,
  OutingTodoItem,
  OutingTodoRepo,
  OutingTodoStatus,
  PlanRepo,
  PlanSnapshot,
  SavedOutingPlan,
  SavedOutingPlanSegment,
  ShareFeedbackEntry,
  ShareFeedbackRepo,
  TransactionRepo,
} from "./types";
