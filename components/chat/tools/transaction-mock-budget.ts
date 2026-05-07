export type TransactionAction =
  | "place_order"
  | "book_reservation"
  | "modify_reservation"
  | "cancel_booking"
  | "gift_delivery"
  | "grocery_delivery"
  | "taxi_pickup";

export function actionLabel(action: TransactionAction): string {
  switch (action) {
    case "place_order":
      return "下单购买";
    case "book_reservation":
      return "预订座位";
    case "modify_reservation":
      return "改签订座";
    case "cancel_booking":
      return "取消预订";
    case "gift_delivery":
      return "蛋糕/鲜花配送";
    case "grocery_delivery":
      return "生鲜/同城配送";
    case "taxi_pickup":
      return "网约车";
    default:
      return action;
  }
}

function seedFromKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function buildBudgetLines(
  action: TransactionAction,
  idempotency_key: string,
): { label: string; amount: number }[] {
  const s = seedFromKey(idempotency_key);
  const base = 30 + (s % 220);

  if (action === "cancel_booking") {
    return [
      { label: "原订单金额（参考）", amount: base },
      { label: "取消手续费", amount: 0 },
      { label: "预计退回", amount: base },
    ];
  }

  if (action === "modify_reservation") {
    return [{ label: "改签手续费（Mock）", amount: Math.round(base * 0.1) }];
  }

  if (action === "book_reservation") {
    const deposit = Math.round(base * 0.2);
    const service = Math.round(base * 0.05);
    return [
      { label: "订金", amount: deposit },
      { label: "平台服务费", amount: service },
      { label: "到店预估尾款", amount: Math.max(0, base - deposit) },
    ];
  }

  if (action === "gift_delivery") {
    const goods = Math.round(base * 1.6);
    const fee = Math.round(base * 0.15);
    return [
      { label: "礼物商品", amount: goods },
      { label: "同城配送费", amount: fee },
      { label: "节日附加 / 卡片", amount: 0 },
    ];
  }

  if (action === "grocery_delivery") {
    const goods = Math.round(base * 1.1);
    const fee = Math.round(base * 0.1);
    return [
      { label: "商品", amount: goods },
      { label: "配送费", amount: fee },
    ];
  }

  if (action === "taxi_pickup") {
    return [
      { label: "起步价 + 里程费", amount: 25 + (s % 50) },
      { label: "高峰加价（如有）", amount: s % 12 === 0 ? 18 : 0 },
    ];
  }

  const goods = Math.round(base * 0.75);
  const pack = Math.round(base * 0.08);
  const discount = -Math.round(base * 0.05);
  return [
    { label: "商品 / 服务估价", amount: goods },
    { label: "打包 / 配送", amount: pack },
    { label: "限时优惠", amount: discount },
  ];
}

export function lineSubtotal(
  action: TransactionAction,
  idempotency_key: string,
): number {
  return buildBudgetLines(action, idempotency_key).reduce((a, b) => a + b.amount, 0);
}
