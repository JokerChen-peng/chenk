import Link from "next/link";
import { PlanListRowActions } from "@/components/plans/plan-list-row-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listSavedPlans } from "@/lib/plans/plan-file-store";

export const dynamic = "force-dynamic";

export default async function PlansIndexPage() {
  const plans = await listSavedPlans();

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">我的方案</h1>
          <Link
            href="/"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            返回对话
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          定稿行程会自动保存到本机 <code className="rounded bg-muted px-1 py-0.5 text-xs">.data/saved-plans.json</code>
          （Demo）；关闭页面后仍可在此重新打开。
        </p>

        {plans.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              暂无已保存方案。在对话里生成「已定稿行程」后会自动保存。
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {plans.map((p) => (
              <li key={p.id}>
                <Card className="border-border/70 transition hover:border-[#FFC300]/50 hover:shadow-md">
                  <Link href={`/plans/${p.id}`} className="block">
                    <CardHeader className="py-3">
                      <CardTitle className="text-base font-medium">
                        {p.title}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.savedAt).toLocaleString("zh-CN")} ·{" "}
                        {p.segments.length} 个时段
                      </p>
                    </CardHeader>
                  </Link>
                  <CardContent className="pb-4 pt-0">
                    <PlanListRowActions plan={p} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
