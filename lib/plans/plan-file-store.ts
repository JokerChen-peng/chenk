/**
 * 旧的具名公共 API；现在转发到 src/infra/repos/getPlanRepo()。
 * 类型定义保留，便于 Tree-shake 和 IDE 跳转。
 */

import { getPlanRepo } from "@/src/infra/repos";

export type {
  PlanSnapshot,
  SavedOutingPlan,
  SavedOutingPlanSegment,
} from "@/src/infra/repos/types";

import type { SavedOutingPlan, PlanSnapshot } from "@/src/infra/repos/types";

export async function listSavedPlans(): Promise<SavedOutingPlan[]> {
  return getPlanRepo().list();
}

export async function getSavedPlan(id: string): Promise<SavedOutingPlan | null> {
  return getPlanRepo().get(id);
}

export async function listPlanSnapshots(id: string): Promise<PlanSnapshot[]> {
  return getPlanRepo().listSnapshots(id);
}

export async function upsertSavedPlan(
  plan: Omit<SavedOutingPlan, "savedAt" | "version"> &
    Partial<Pick<SavedOutingPlan, "savedAt" | "version" | "parent_snapshot_id">>,
): Promise<SavedOutingPlan> {
  return getPlanRepo().upsert(plan);
}

export async function updateSavedPlanTitle(
  id: string,
  title: string,
): Promise<SavedOutingPlan | null> {
  return getPlanRepo().updateTitle(id, title);
}

export async function deleteSavedPlan(id: string): Promise<boolean> {
  return getPlanRepo().delete(id);
}

export async function rollbackToSnapshot(args: {
  id: string;
  snapshot_id: string;
}): Promise<SavedOutingPlan | null> {
  return getPlanRepo().rollback(args);
}
