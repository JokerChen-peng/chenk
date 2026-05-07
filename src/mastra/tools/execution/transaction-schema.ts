import { z } from "zod";
import { isoDateTimeFromLlm } from "@/src/mastra/tools/nlu/coerce-iso-datetime";

export const transactionActionSchema = z.enum([
  "place_order",
  "book_reservation",
  "modify_reservation",
  "cancel_booking",
  "gift_delivery",
  "grocery_delivery",
  "taxi_pickup",
]);
export type TransactionAction = z.infer<typeof transactionActionSchema>;

export const giftTypeSchema = z.enum(["cake", "flowers", "balloon", "card", "snack_box"]);

const reservationDetailsSchema = z.object({
  party_size: z.number().int().min(1).max(40),
  desired_time_iso: isoDateTimeFromLlm,
  slot_id: z.string().min(1).optional(),
  seat_preference: z.string().max(80).optional(),
});

const deliveryDetailsSchema = z.object({
  /** 送达目标 POI（例如蛋糕送到餐厅 A） */
  target_poi_id: z.string().min(1).optional(),
  /** 或者送到具体地址（与 target_poi_id 二选一） */
  delivery_address: z.string().max(200).optional(),
  deliver_at_iso: isoDateTimeFromLlm,
  recipient_name: z.string().max(40).optional(),
  message_card: z.string().max(140).optional(),
  gift_type: giftTypeSchema.optional(),
});

const taxiDetailsSchema = z.object({
  origin_poi_id: z.string().min(1).optional(),
  origin_address: z.string().max(200).optional(),
  destination_poi_id: z.string().min(1),
  pickup_at_iso: isoDateTimeFromLlm,
  party_size: z.number().int().min(1).max(7),
});

const couponSchema = z.object({
  /** group buy deal id 或自定义优惠券码 */
  code: z.string().min(2).max(40),
  /** 折扣金额（CNY），仅做展示用，不会实际改 mock_order_ref */
  discount_cny: z.number().nonnegative().optional(),
});

/** 用于 single + batch 共享的「一笔操作」 schema. */
export const operationLineSchema = z.object({
  poi_id: z.string().min(1),
  action_type: transactionActionSchema,
  idempotency_key: z.string().uuid(),
  label: z.string().min(1).max(80).optional(),
  /** 关联到行程哪一段（segment_id），便于 UI 与审计 */
  related_segment_id: z.string().min(1).max(64).optional(),
  reservation: reservationDetailsSchema.optional(),
  delivery: deliveryDetailsSchema.optional(),
  taxi: taxiDetailsSchema.optional(),
  coupon: couponSchema.optional(),
  expected_amount_cny: z.number().nonnegative().optional(),
  payment_method: z
    .enum(["meituan_wallet", "wechat_pay", "alipay", "cash"])
    .optional(),
});

/** 手写一份 OperationLine TS 类型，避免 z.preprocess 让 z.infer 推断出 unknown。 */
export type OperationLine = {
  poi_id: string;
  action_type: TransactionAction;
  idempotency_key: string;
  label?: string;
  related_segment_id?: string;
  reservation?: {
    party_size: number;
    desired_time_iso: string | unknown;
    slot_id?: string;
    seat_preference?: string;
  };
  delivery?: {
    target_poi_id?: string;
    delivery_address?: string;
    deliver_at_iso: string | unknown;
    recipient_name?: string;
    message_card?: string;
    gift_type?: z.infer<typeof giftTypeSchema>;
  };
  taxi?: {
    origin_poi_id?: string;
    origin_address?: string;
    destination_poi_id: string;
    pickup_at_iso: string | unknown;
    party_size: number;
  };
  coupon?: { code: string; discount_cny?: number };
  expected_amount_cny?: number;
  payment_method?: "meituan_wallet" | "wechat_pay" | "alipay" | "cash";
};

/** 工具结果里每条操作的回执. */
export const operationResultSchema = z.object({
  poi_id: z.string(),
  action_type: transactionActionSchema,
  idempotency_key: z.string().uuid(),
  mock_order_ref: z.string(),
  label: z.string().optional(),
  amount_cny: z.number().nonnegative().optional(),
  applied_discount_cny: z.number().nonnegative().optional(),
  related_segment_id: z.string().optional(),
  notes: z.string().optional(),
});
export type OperationResult = z.infer<typeof operationResultSchema>;

/** 把 OperationLine 标准化成回执（含 mock 价格估算）. */
export function buildResultLine(op: OperationLine): OperationResult {
  const baseAmount =
    op.expected_amount_cny ??
    estimateAmountFromKey(op.idempotency_key, op.action_type);
  const discount = op.coupon?.discount_cny ?? 0;
  const amount = Math.max(0, baseAmount - discount);
  const note = describeOperation(op);

  return {
    poi_id: op.poi_id,
    action_type: op.action_type,
    idempotency_key: op.idempotency_key,
    mock_order_ref: `mock-${op.idempotency_key.slice(0, 8)}`,
    label: op.label,
    amount_cny: Number(amount.toFixed(0)),
    applied_discount_cny: discount > 0 ? discount : undefined,
    related_segment_id: op.related_segment_id,
    notes: note,
  };
}

function estimateAmountFromKey(key: string, action: TransactionAction): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const base = 50 + (Math.abs(h) % 360);
  switch (action) {
    case "cancel_booking":
      return 0;
    case "modify_reservation":
      return Math.round(base * 0.1);
    case "book_reservation":
      return Math.round(base * 0.2);
    case "taxi_pickup":
      return 25 + (Math.abs(h) % 60);
    default:
      return base;
  }
}

function describeOperation(op: OperationLine): string | undefined {
  const bits: string[] = [];
  if (op.reservation) {
    bits.push(
      `订座 ${op.reservation.party_size} 人 @ ${String(op.reservation.desired_time_iso)}`,
    );
    if (op.reservation.seat_preference) {
      bits.push(op.reservation.seat_preference);
    }
  }
  if (op.delivery) {
    const where =
      op.delivery.target_poi_id ?? op.delivery.delivery_address ?? "(未指定)";
    bits.push(
      `送达 ${where} @ ${String(op.delivery.deliver_at_iso)}${
        op.delivery.gift_type ? ` · ${op.delivery.gift_type}` : ""
      }`,
    );
    if (op.delivery.message_card) bits.push(`卡片：${op.delivery.message_card}`);
  }
  if (op.taxi) {
    bits.push(
      `打车 ${op.taxi.party_size} 人 ${String(op.taxi.pickup_at_iso)} → ${op.taxi.destination_poi_id}`,
    );
  }
  if (op.coupon) {
    bits.push(`券 ${op.coupon.code}`);
  }
  if (op.payment_method) {
    bits.push(`支付 ${op.payment_method}`);
  }
  return bits.length > 0 ? bits.join(" · ") : undefined;
}
