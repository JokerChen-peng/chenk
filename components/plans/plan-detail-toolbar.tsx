"use client";

import Link from "next/link";
import type { SavedOutingPlan } from "@/lib/plans/plan-file-store";
import { PlanExportButtons } from "@/components/plans/plan-export-buttons";
import { MessageSquare } from "lucide-react";

type Props = {
  plan: SavedOutingPlan;
};

export function PlanDetailToolbar({ plan }: Props) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <Link
        href={`/?continuePlan=${encodeURIComponent(plan.id)}`}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/15"
      >
        <MessageSquare className="h-4 w-4 shrink-0" aria-hidden />
        在对话中继续调整此方案
      </Link>
      <PlanExportButtons plan={plan} />
    </div>
  );
}
