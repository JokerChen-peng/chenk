"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { ToolCard } from "./_shared/tool-card";

type ValidateResult = {
  feasible: boolean;
  checked_nodes_count: number;
  overlap_pairs: [string, string][];
};

function isValidateResult(v: unknown): v is ValidateResult {
  return (
    !!v &&
    typeof v === "object" &&
    "feasible" in v &&
    typeof (v as ValidateResult).checked_nodes_count === "number"
  );
}

export function ValidateTimelineFeasibilityToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  return (
    <ToolCard<ValidateResult>
      props={props}
      isExpectedShape={isValidateResult}
      errorMessage="时间轴存在冲突或参数无效，请根据模型说明调整时段。"
      loadingFallback={
        <div className="my-2 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          校验时间轴…
        </div>
      }
      errorFallback={
        <div className="my-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
          时间轴存在冲突或参数无效，请根据模型说明调整时段。
        </div>
      }
      render={(r) =>
        r.feasible ? (
          <div className="my-2 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              已校验 <strong>{r.checked_nodes_count}</strong> 个时间节点，无重叠
            </span>
          </div>
        ) : null
      }
    />
  );
}
