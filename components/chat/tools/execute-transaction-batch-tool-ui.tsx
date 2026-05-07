"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { Check, Layers, ShieldAlert, X } from "lucide-react";
import { useCallback, useRef } from "react";
import {
  actionLabel,
  buildBudgetLines,
  type TransactionAction,
} from "@/components/chat/tools/transaction-mock-budget";
import {
  OperationDetailRows,
  type RichOperationLine,
} from "@/components/chat/tools/execute-transaction-tool-ui";
import { ToolCard } from "./_shared/tool-card";

type BatchResult = {
  status: "completed";
  bundle_id: string;
  line_count: number;
  total_amount_cny: number;
  total_discount_cny: number;
  results: {
    poi_id: string;
    action_type: TransactionAction;
    idempotency_key: string;
    mock_order_ref: string;
    label?: string;
    amount_cny?: number;
    applied_discount_cny?: number;
    related_segment_id?: string;
    notes?: string;
  }[];
  message: string;
};

const VALID_ACTIONS: TransactionAction[] = [
  "place_order",
  "book_reservation",
  "modify_reservation",
  "cancel_booking",
  "gift_delivery",
  "grocery_delivery",
  "taxi_pickup",
];

function parseOperations(raw: Record<string, unknown>): RichOperationLine[] | null {
  const ops = raw.operations;
  if (!Array.isArray(ops) || ops.length < 2) return null;
  const out: RichOperationLine[] = [];
  for (const item of ops) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    if (
      typeof o.poi_id !== "string" ||
      typeof o.action_type !== "string" ||
      typeof o.idempotency_key !== "string" ||
      !VALID_ACTIONS.includes(o.action_type as TransactionAction)
    ) {
      return null;
    }
    out.push({
      poi_id: o.poi_id,
      action_type: o.action_type as TransactionAction,
      idempotency_key: o.idempotency_key,
      label: typeof o.label === "string" ? o.label : undefined,
      related_segment_id:
        typeof o.related_segment_id === "string" ? o.related_segment_id : undefined,
      reservation: o.reservation as RichOperationLine["reservation"],
      delivery: o.delivery as RichOperationLine["delivery"],
      taxi: o.taxi as RichOperationLine["taxi"],
      coupon: o.coupon as RichOperationLine["coupon"],
      expected_amount_cny:
        typeof o.expected_amount_cny === "number" ? o.expected_amount_cny : undefined,
      payment_method:
        typeof o.payment_method === "string" ? o.payment_method : undefined,
    });
  }
  return out.length >= 2 ? out : null;
}

function useDebouncedGuard(ms: number) {
  const last = useRef(0);
  return useCallback(
    (fn: () => void) => {
      const now = Date.now();
      if (now - last.current < ms) return;
      last.current = now;
      fn();
    },
    [ms],
  );
}

function lineEstimate(op: RichOperationLine): { amount: number; discount: number } {
  const baseLines = buildBudgetLines(op.action_type, op.idempotency_key);
  const baseSum = baseLines.reduce((a, b) => a + b.amount, 0);
  const expected = op.expected_amount_cny ?? Math.max(0, baseSum);
  const discount = op.coupon?.discount_cny ?? 0;
  return { amount: Math.max(0, expected - discount), discount };
}

function BatchApprovalCard(
  props: ToolCallMessagePartProps<Record<string, unknown>, BatchResult> & {
    operations: RichOperationLine[];
  },
) {
  const guard = useDebouncedGuard(380);
  const totals = props.operations.reduce(
    (acc, op) => {
      const e = lineEstimate(op);
      acc.amount += e.amount;
      acc.discount += e.discount;
      return acc;
    },
    { amount: 0, discount: 0 },
  );

  const onApprove = () => guard(() => props.resume({ approved: true }));
  const onReject = () =>
    guard(() => props.resume({ approved: false, reason: "用户拒绝多笔编排授权" }));

  return (
    <div className="relative my-4 overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f141a] via-[#101a24] to-[#0f1410]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 backdrop-blur-xl bg-white/[0.06]"
        aria-hidden
      />
      <div className="relative p-5 text-white">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFC300]/25 ring-1 ring-[#FFC300]/50">
            <Layers className="h-6 w-6 text-[#FFC300]" aria-hidden />
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight">
              一键多笔编排 · 授权确认
            </h3>
            <p className="mt-1 text-sm text-white/70">
              将依次完成 {props.operations.length} 笔 Mock 交易（同一授权）。请逐条核对。
            </p>
          </div>
        </div>

        <ul className="mt-4 max-h-96 space-y-3 overflow-y-auto pr-1">
          {props.operations.map((op, idx) => {
            const e = lineEstimate(op);
            return (
              <li
                key={`${op.idempotency_key}-${idx}`}
                className="rounded-xl bg-black/30 px-4 py-3 ring-1 ring-white/10"
              >
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-white/50">
                    第 {idx + 1} 笔
                  </span>
                  <span className="text-xs text-[#FFD966]">
                    {actionLabel(op.action_type)}
                  </span>
                </div>
                {op.label ? (
                  <p className="mt-2 text-sm text-white/90">{op.label}</p>
                ) : null}
                <p className="mt-1 font-mono text-[11px] text-white/75">
                  POI {op.poi_id}
                </p>
                <div className="mt-2">
                  <OperationDetailRows op={op} />
                </div>
                <p className="mt-2 text-xs text-white/55">
                  小计（Mock）{" "}
                  <span className="tabular-nums text-white">¥{e.amount}</span>
                  {e.discount > 0 ? (
                    <span className="ml-2 text-emerald-300">
                      已减 ¥{e.discount}
                    </span>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-black/25 px-4 py-3 ring-1 ring-[#FFC300]/30">
          <span className="flex items-center gap-2 text-sm text-white/80">
            <ShieldAlert className="h-4 w-4 text-[#FFC300]" aria-hidden />
            预估合计（模拟）
            {totals.discount > 0 ? (
              <span className="ml-2 text-xs text-emerald-300">
                总优惠 ¥{totals.discount}
              </span>
            ) : null}
          </span>
          <span className="text-lg font-semibold tabular-nums text-[#FFC300]">
            ¥{totals.amount}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onReject}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/10"
          >
            <X className="h-4 w-4" />
            拒绝
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FFC300] to-[#FF9500] px-4 py-2.5 text-sm font-semibold text-[#1a0f0a] shadow-lg shadow-[#FFC300]/25 transition hover:brightness-105"
          >
            <Check className="h-4 w-4" />
            确认全部授权
          </button>
        </div>
      </div>
    </div>
  );
}

function BatchSuccessCard({ result }: { result: BatchResult }) {
  return (
    <div className="my-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
      <p className="font-medium text-emerald-800 dark:text-emerald-200">
        多笔编排已完成（合计 ¥{result.total_amount_cny}
        {result.total_discount_cny > 0 ? ` · 优惠 ¥${result.total_discount_cny}` : ""}）
      </p>
      <p className="mt-1 text-muted-foreground">{result.message}</p>
      <p className="mt-2 font-mono text-xs text-foreground/80">bundle {result.bundle_id}</p>
      <ul className="mt-3 space-y-1.5 border-t border-emerald-500/20 pt-3 text-xs">
        {result.results.map((r, i) => (
          <li key={r.idempotency_key} className="flex flex-col gap-0.5">
            <span className="text-muted-foreground">
              {i + 1}. {actionLabel(r.action_type)} · {r.poi_id}
              {r.label ? ` · ${r.label}` : ""}
              {typeof r.amount_cny === "number" ? ` · ¥${r.amount_cny}` : ""}
            </span>
            <span className="font-mono text-foreground/80">{r.mock_order_ref}</span>
            {r.notes ? (
              <span className="text-[11px] text-muted-foreground">{r.notes}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExecuteTransactionBatchToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, BatchResult>,
) {
  const operations = parseOperations(props.args as Record<string, unknown>);
  const waitingHuman =
    props.status.type === "requires-action" &&
    props.status.reason === "interrupt";

  if (waitingHuman) {
    if (!operations) {
      return (
        <div className="my-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-amber-950 dark:text-amber-100">
            需要人工确认：execute_transaction_batch
          </p>
          <p className="mt-1 text-muted-foreground">
            无法解析多笔参数（至少需要 2 条 operations）。
          </p>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-background/80 p-2 text-xs">
            {props.argsText}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              onClick={() => props.resume({ approved: true })}
            >
              批准执行
            </button>
            <button
              type="button"
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium"
              onClick={() => props.resume({ approved: false, reason: "用户拒绝" })}
            >
              拒绝
            </button>
          </div>
        </div>
      );
    }
    return <BatchApprovalCard {...props} operations={operations} />;
  }

  return (
    <ToolCard<BatchResult>
      props={props}
      isExpectedShape={(v): v is BatchResult =>
        !!v &&
        typeof v === "object" &&
        "status" in v &&
        (v as BatchResult).status === "completed"
      }
      errorMessage="多笔编排失败或被拒绝。"
      loadingFallback={
        <div className="my-3 flex items-center gap-3 rounded-xl border border-border/70 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#FFC300] border-t-transparent" />
          正在处理多笔编排…
        </div>
      }
      render={(r) => <BatchSuccessCard result={r} />}
    />
  );
}
