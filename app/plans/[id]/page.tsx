import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanDetailToolbar } from "@/components/plans/plan-detail-toolbar";
import { PlanVersionHistory } from "@/components/plans/plan-version-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSavedPlan } from "@/lib/plans/plan-file-store";

export const dynamic = "force-dynamic";

function formatRange(startIso: string, endIso: string) {
  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const tf = new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "short",
      timeStyle: "short",
    });
    return `${tf.format(s)} – ${tf.format(e)}`;
  } catch {
    return `${startIso} – ${endIso}`;
  }
}

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plan = await getSavedPlan(id);
  if (!plan) notFound();

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/plans"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← 全部方案
          </Link>
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            返回对话（空白）
          </Link>
        </div>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="space-y-4 border-b border-border/60">
            <PlanDetailToolbar plan={plan} />
            <div>
              <p className="text-xs text-muted-foreground">已保存方案 · 详情只读</p>
              <CardTitle className="mt-1 text-xl">{plan.title}</CardTitle>
              <p className="mt-2 font-mono text-xs text-muted-foreground">{plan.id}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                保存于 {new Date(plan.savedAt).toLocaleString("zh-CN")} · v
                {plan.version}
                {typeof plan.total_estimated_cost_cny === "number"
                  ? ` · 预估 ¥${plan.total_estimated_cost_cny}`
                  : ""}
                {typeof plan.budget_total_cny === "number"
                  ? ` / 预算 ¥${plan.budget_total_cny}`
                  : ""}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <PlanVersionHistory planId={plan.id} />
            <ol className="space-y-4">
              {plan.segments.map((seg, idx) => (
                <li
                  key={seg.segment_id || String(idx)}
                  className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {seg.kind}
                  </p>
                  <p className="mt-1 font-medium">{seg.label}</p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                    {formatRange(seg.start_time_iso, seg.end_time_iso)}
                  </p>
                  {seg.poi_id ? (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      POI {seg.poi_id}
                    </p>
                  ) : null}
                  {seg.notes ? (
                    <p className="mt-2 text-sm text-muted-foreground">{seg.notes}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
