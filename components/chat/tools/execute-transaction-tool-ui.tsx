"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { Check, ShieldAlert, X } from "lucide-react";
import { useCallback, useRef } from "react";
import {
  actionLabel,
  buildBudgetLines,
  type TransactionAction,
} from "@/components/chat/tools/transaction-mock-budget";
import { ToolCard } from "./_shared/tool-card";

export type RichOperationLine = {
  poi_id: string;
  action_type: TransactionAction;
  idempotency_key: string;
  label?: string;
  related_segment_id?: string;
  reservation?: {
    party_size: number;
    desired_time_iso: string;
    slot_id?: string;
    seat_preference?: string;
  };
  delivery?: {
    target_poi_id?: string;
    delivery_address?: string;
    deliver_at_iso: string;
    recipient_name?: string;
    message_card?: string;
    gift_type?: string;
  };
  taxi?: {
    origin_poi_id?: string;
    origin_address?: string;
    destination_poi_id: string;
    pickup_at_iso: string;
    party_size: number;
  };
  coupon?: { code: string; discount_cny?: number };
  expected_amount_cny?: number;
  payment_method?: string;
};

type ExecuteTransactionResult = {
  status: "completed";
  result: {
    poi_id: string;
    action_type: TransactionAction;
    idempotency_key: string;
    mock_order_ref: string;
    label?: string;
    amount_cny?: number;
    applied_discount_cny?: number;
    related_segment_id?: string;
    notes?: string;
  };
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

function parseOperation(raw: Record<string, unknown>): RichOperationLine | null {
  const poi_id = raw.poi_id;
  const action_type = raw.action_type;
  const idempotency_key = raw.idempotency_key;
  if (
    typeof poi_id !== "string" ||
    typeof action_type !== "string" ||
    typeof idempotency_key !== "string"
  ) {
    return null;
  }
  if (!VALID_ACTIONS.includes(action_type as TransactionAction)) return null;
  return {
    poi_id,
    action_type: action_type as TransactionAction,
    idempotency_key,
    label: typeof raw.label === "string" ? raw.label : undefined,
    related_segment_id:
      typeof raw.related_segment_id === "string" ? raw.related_segment_id : undefined,
    reservation: raw.reservation as RichOperationLine["reservation"],
    delivery: raw.delivery as RichOperationLine["delivery"],
    taxi: raw.taxi as RichOperationLine["taxi"],
    coupon: raw.coupon as RichOperationLine["coupon"],
    expected_amount_cny:
      typeof raw.expected_amount_cny === "number" ? raw.expected_amount_cny : undefined,
    payment_method:
      typeof raw.payment_method === "string" ? raw.payment_method : undefined,
  };
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

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return iso;
  }
}

export function OperationDetailRows({ op }: { op: RichOperationLine }) {
  return (
    <div className="space-y-1 text-xs text-white/80">
      {op.related_segment_id ? (
        <p>
          关联段：<span className="font-mono text-white/90">{op.related_segment_id}</span>
        </p>
      ) : null}
      {op.reservation ? (
        <p>
          订座：{op.reservation.party_size} 人 · {fmtTime(op.reservation.desired_time_iso)}
          {op.reservation.seat_preference ? ` · ${op.reservation.seat_preference}` : ""}
        </p>
      ) : null}
      {op.delivery ? (
        <p>
          送达：{op.delivery.target_poi_id ?? op.delivery.delivery_address ?? "未填地址"} ·{" "}
          {fmtTime(op.delivery.deliver_at_iso)}
          {op.delivery.gift_type ? ` · ${op.delivery.gift_type}` : ""}
          {op.delivery.message_card ? ` · 卡片：${op.delivery.message_card}` : ""}
        </p>
      ) : null}
      {op.taxi ? (
        <p>
          打车：{op.taxi.party_size} 人 · {fmtTime(op.taxi.pickup_at_iso)} →{" "}
          {op.taxi.destination_poi_id}
        </p>
      ) : null}
      {op.coupon ? (
        <p>
          优惠券：<span className="font-mono">{op.coupon.code}</span>
          {typeof op.coupon.discount_cny === "number" ? ` · 立减 ¥${op.coupon.discount_cny}` : ""}
        </p>
      ) : null}
      {op.payment_method ? <p>支付：{op.payment_method}</p> : null}
    </div>
  );
}

function ApprovalCard(
  props: ToolCallMessagePartProps<
    Record<string, unknown>,
    ExecuteTransactionResult
  > & { op: RichOperationLine },
) {
  const guard = useDebouncedGuard(380);
  const lines = buildBudgetLines(props.op.action_type, props.op.idempotency_key);
  const subtotalRaw = lines.reduce((a, b) => a + b.amount, 0);
  const expected = props.op.expected_amount_cny ?? subtotalRaw;
  const discount = props.op.coupon?.discount_cny ?? 0;
  const finalAmount = Math.max(0, expected - discount);

  const onApprove = () => guard(() => props.resume({ approved: true }));
  const onReject = () =>
    guard(() =>
      props.resume({
        approved: false,
        reason: "用户选择拒绝并修改交易参数",
      }),
    );

  return (
    <div className="relative my-4 overflow-hidden rounded-2xl border border-white/20 shadow-2xl">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#1a0f0a] via-[#2d1810] to-[#1f1410]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 backdrop-blur-xl bg-white/[0.06]"
        aria-hidden
      />
      <div className="relative p-5 text-white">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFC300]/25 ring-1 ring-[#FFC300]/50">
            <ShieldAlert className="h-6 w-6 text-[#FFC300]" aria-hidden />
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight">
              授权确认 · {actionLabel(props.op.action_type)}
            </h3>
            <p className="mt-1 text-sm text-white/70">
              {props.op.label ?? "请核对详情后再授权 Mock 执行。"}
            </p>
          </div>
        </div>

        <dl className="mt-5 space-y-2 rounded-xl bg-black/25 px-4 py-3 text-sm ring-1 ring-white/10">
          <div className="flex justify-between gap-4">
            <dt className="text-white/60">目标 POI</dt>
            <dd className="max-w-[60%] truncate font-mono text-xs text-white/90">
              {props.op.poi_id}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/60">幂等键</dt>
            <dd className="truncate font-mono text-[11px] text-white/75">
              {props.op.idempotency_key}
            </dd>
          </div>
        </dl>

        <div className="mt-3 rounded-xl bg-black/20 px-4 py-3 ring-1 ring-white/10">
          <OperationDetailRows op={props.op} />
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-white/50">
            预算明细（模拟）
          </p>
          <ul className="mt-2 divide-y divide-white/10 rounded-xl bg-black/20 ring-1 ring-white/10">
            {lines.map((line) => (
              <li
                key={line.label}
                className="flex justify-between gap-4 px-4 py-2.5 text-sm"
              >
                <span className="text-white/75">{line.label}</span>
                <span
                  className={`tabular-nums font-medium ${line.amount < 0 ? "text-emerald-300" : "text-white"}`}
                >
                  {line.amount < 0 ? "−" : ""}¥{Math.abs(line.amount)}
                </span>
              </li>
            ))}
            {discount > 0 ? (
              <li className="flex justify-between gap-4 px-4 py-2.5 text-sm text-emerald-300">
                <span>优惠券抵扣</span>
                <span className="tabular-nums">−¥{discount}</span>
              </li>
            ) : null}
            <li className="flex justify-between gap-4 px-4 py-3 text-base font-semibold">
              <span className="text-white/90">预估合计</span>
              <span className="tabular-nums text-[#FFC300]">¥{finalAmount}</span>
            </li>
          </ul>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onReject}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/90 backdrop-blur-sm transition hover:bg-white/10"
          >
            <X className="h-4 w-4" />
            拒绝并修改
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FFC300] to-[#FF9500] px-4 py-2.5 text-sm font-semibold text-[#1a0f0a] shadow-lg shadow-[#FFC300]/25 transition hover:brightness-105"
          >
            <Check className="h-4 w-4" />
            确认授权
          </button>
        </div>
      </div>
    </div>
  );
}

function SuccessCard({ result }: { result: ExecuteTransactionResult }) {
  const r = result.result;
  return (
    <div className="my-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
      <p className="font-medium text-emerald-800 dark:text-emerald-200">
        Mock 交易已完成 · {actionLabel(r.action_type)}
      </p>
      <p className="mt-1 text-muted-foreground">{result.message}</p>
      <p className="mt-2 font-mono text-xs text-foreground/80">
        参考单号 {r.mock_order_ref}
      </p>
      {typeof r.amount_cny === "number" ? (
        <p className="mt-1 text-xs">
          实际金额（Mock）<span className="tabular-nums">¥{r.amount_cny}</span>
          {typeof r.applied_discount_cny === "number" && r.applied_discount_cny > 0
            ? ` · 已减 ¥${r.applied_discount_cny}`
            : ""}
        </p>
      ) : null}
      {r.notes ? <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p> : null}
      {r.related_segment_id ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          对应行程段 {r.related_segment_id}
        </p>
      ) : null}
    </div>
  );
}

export function ExecuteTransactionToolUI(
  props: ToolCallMessagePartProps<
    Record<string, unknown>,
    ExecuteTransactionResult
  >,
) {
  const op = parseOperation(props.args as Record<string, unknown>);
  const waitingHuman =
    props.status.type === "requires-action" &&
    props.status.reason === "interrupt";

  if (waitingHuman) {
    if (!op) {
      return (
        <div className="my-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium text-amber-950 dark:text-amber-100">
            需要人工确认：execute_transaction
          </p>
          <p className="mt-1 text-muted-foreground">无法解析交易参数，原始入参：</p>
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
              onClick={() =>
                props.resume({ approved: false, reason: "用户拒绝执行该工具调用" })
              }
            >
              拒绝
            </button>
          </div>
        </div>
      );
    }
    return <ApprovalCard {...props} op={op} />;
  }

  return (
    <ToolCard<ExecuteTransactionResult>
      props={props}
      isExpectedShape={(v): v is ExecuteTransactionResult =>
        !!v &&
        typeof v === "object" &&
        "status" in v &&
        (v as ExecuteTransactionResult).status === "completed"
      }
      errorMessage="交易执行失败或被拒绝。"
      loadingFallback={
        <div className="my-3 flex items-center gap-3 rounded-xl border border-border/70 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#FFC300] border-t-transparent" />
          正在处理交易请求…
        </div>
      }
      render={(r) => <SuccessCard result={r} />}
    />
  );
}
