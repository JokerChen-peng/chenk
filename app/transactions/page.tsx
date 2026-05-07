import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAuditedBundles } from "@/lib/plans/transaction-audit-store";
import { RollbackBundleButton } from "./rollback-button";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  place_order: "下单",
  book_reservation: "订座",
  modify_reservation: "改签",
  cancel_booking: "取消",
  gift_delivery: "礼物配送",
  grocery_delivery: "同城配送",
  taxi_pickup: "网约车",
};

export default async function TransactionsPage() {
  const bundles = await listAuditedBundles();
  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">我下过的单</h1>
          <Link
            href="/"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            返回对话
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          所有 Mock 执行（单笔 / 多笔 / 改签）都会写入{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            .data/transactions.json
          </code>
          ，便于核对与演示。仅本机可见。
        </p>

        {bundles.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              尚未执行任何 Mock 交易。在对话里说「确认下单」「同意预订」即可生成。
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {bundles.map((b) => (
              <li key={b.bundle_id}>
                <Card
                  className={`border-border/70 ${
                    b.rolled_back_at ? "opacity-70 ring-1 ring-red-500/20" : ""
                  }`}
                >
                  <CardHeader className="py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm font-medium">
                          Bundle {b.bundle_id.slice(0, 8)}…
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {new Date(b.created_at).toLocaleString("zh-CN")} ·{" "}
                          {b.results.length} 笔
                        </p>
                        {b.message ? (
                          <p className="mt-1 text-xs text-muted-foreground">{b.message}</p>
                        ) : null}
                        {b.rolled_back_at ? (
                          <p className="mt-1 text-[11px] text-red-700 dark:text-red-300">
                            撤销于 {new Date(b.rolled_back_at).toLocaleString("zh-CN")}
                            {b.rollback_reason ? ` · ${b.rollback_reason}` : ""}
                          </p>
                        ) : null}
                      </div>
                      <RollbackBundleButton
                        bundleId={b.bundle_id}
                        alreadyRolledBack={Boolean(b.rolled_back_at)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pb-4 pt-0">
                    <ul className="space-y-2">
                      {b.results.map((r) => (
                        <li
                          key={r.idempotency_key}
                          className="rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">
                              {ACTION_LABEL[r.action_type] ?? r.action_type}
                              {r.label ? ` · ${r.label}` : ""}
                            </span>
                            {typeof r.amount_cny === "number" ? (
                              <span className="tabular-nums text-foreground">
                                ¥{r.amount_cny}
                                {typeof r.applied_discount_cny === "number" &&
                                r.applied_discount_cny > 0
                                  ? ` (券 −¥${r.applied_discount_cny})`
                                  : ""}
                              </span>
                            ) : null}
                          </div>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            POI {r.poi_id} · {r.mock_order_ref}
                          </p>
                          {r.notes ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {r.notes}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
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
