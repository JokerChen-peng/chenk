import { createJsonFileStore } from "@/src/infra/json-file-store";
import type {
  PlanRepo,
  PlanSnapshot,
  SavedOutingPlan,
} from "@/src/infra/repos/types";

type StoreFile = {
  plans: SavedOutingPlan[];
  snapshots: PlanSnapshot[];
};

const store = createJsonFileStore<StoreFile>({
  fileName: "saved-plans.json",
  defaults: () => ({ plans: [], snapshots: [] }),
  validate: (raw): raw is StoreFile => {
    if (!raw || typeof raw !== "object") return false;
    const r = raw as Partial<StoreFile>;
    return Array.isArray(r.plans) && Array.isArray(r.snapshots);
  },
});

export class JsonFilePlanRepo implements PlanRepo {
  async list(): Promise<SavedOutingPlan[]> {
    const { plans } = await store.read();
    return [...plans].sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    );
  }

  async get(id: string): Promise<SavedOutingPlan | null> {
    const { plans } = await store.read();
    return plans.find((p) => p.id === id) ?? null;
  }

  async listSnapshots(id: string): Promise<PlanSnapshot[]> {
    const { snapshots } = await store.read();
    return snapshots
      .filter((s) => s.id === id)
      .sort((a, b) => b.version - a.version);
  }

  async upsert(
    plan: Omit<SavedOutingPlan, "savedAt" | "version"> &
      Partial<Pick<SavedOutingPlan, "savedAt" | "version" | "parent_snapshot_id">>,
  ): Promise<SavedOutingPlan> {
    let result!: SavedOutingPlan;
    await store.update((cur) => {
      const savedAt = plan.savedAt ?? new Date().toISOString();
      const idx = cur.plans.findIndex((p) => p.id === plan.id);
      const prev = idx >= 0 ? cur.plans[idx] : null;
      const prevSnapshot = [...cur.snapshots]
        .filter((s) => s.id === plan.id)
        .sort((a, b) => b.version - a.version)[0];
      const next: SavedOutingPlan = {
        id: plan.id,
        title: plan.title,
        savedAt,
        segments: plan.segments,
        version: prev ? prev.version + 1 : 1,
        parent_snapshot_id: prevSnapshot ? prevSnapshot.snapshot_id : undefined,
        total_estimated_cost_cny: plan.total_estimated_cost_cny,
        budget_total_cny: plan.budget_total_cny,
      };
      if (idx >= 0) cur.plans[idx] = next;
      else cur.plans.push(next);
      const snapshot: PlanSnapshot = {
        ...next,
        snapshot_id: crypto.randomUUID(),
      };
      cur.snapshots.push(snapshot);
      if (cur.snapshots.length > 1000) {
        cur.snapshots.splice(0, cur.snapshots.length - 1000);
      }
      result = next;
      return cur;
    });
    return result;
  }

  async updateTitle(id: string, title: string): Promise<SavedOutingPlan | null> {
    let result: SavedOutingPlan | null = null;
    await store.update((cur) => {
      const idx = cur.plans.findIndex((p) => p.id === id);
      if (idx < 0) return cur;
      const prev = cur.plans[idx]!;
      const next: SavedOutingPlan = { ...prev, title };
      cur.plans[idx] = next;
      result = next;
      return cur;
    });
    return result;
  }

  async delete(id: string): Promise<boolean> {
    let removed = false;
    await store.update((cur) => {
      const before = cur.plans.length;
      cur.plans = cur.plans.filter((p) => p.id !== id);
      removed = cur.plans.length !== before;
      return cur;
    });
    return removed;
  }

  async rollback(args: {
    id: string;
    snapshot_id: string;
  }): Promise<SavedOutingPlan | null> {
    let result: SavedOutingPlan | null = null;
    await store.update((cur) => {
      const target = cur.snapshots.find(
        (s) => s.id === args.id && s.snapshot_id === args.snapshot_id,
      );
      if (!target) return cur;
      const idx = cur.plans.findIndex((p) => p.id === args.id);
      const prev = idx >= 0 ? cur.plans[idx] : null;
      const next: SavedOutingPlan = {
        id: target.id,
        title: target.title,
        savedAt: new Date().toISOString(),
        segments: target.segments,
        version: prev ? prev.version + 1 : target.version + 1,
        parent_snapshot_id: target.snapshot_id,
        total_estimated_cost_cny: target.total_estimated_cost_cny,
        budget_total_cny: target.budget_total_cny,
      };
      if (idx >= 0) cur.plans[idx] = next;
      else cur.plans.push(next);
      const snapshot: PlanSnapshot = {
        ...next,
        snapshot_id: crypto.randomUUID(),
      };
      cur.snapshots.push(snapshot);
      result = next;
      return cur;
    });
    return result;
  }
}
