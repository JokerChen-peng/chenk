"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";

const FRAGMENT_ZH: Record<string, string> = {
  domain: "产品边界",
  examples: "示例话术",
  forbidden: "禁止项",
  tool_routing: "工具顺序",
  execution_boundaries: "执行边界",
};

function harnessRow(
  title: string,
  body: string,
  subtle?: string,
) {
  return (
    <div className="my-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
      <div className="font-medium text-foreground">{title}</div>
      <div className="mt-0.5 text-muted-foreground">{body}</div>
      {subtle ? (
        <div className="mt-1 text-[11px] text-muted-foreground/80">{subtle}</div>
      ) : null}
    </div>
  );
}

function isLoading(props: ToolCallMessagePartProps) {
  return (
    props.result === undefined &&
    !props.isError &&
    props.status.type !== "incomplete"
  );
}

export function LoadOutingSkillToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) {
    return harnessRow("出行说明", "载入失败，请稍后重试或换种说法。");
  }
  if (isLoading(props)) {
    return harnessRow("出行说明", "正在载入策略片段…");
  }
  const args = props.args as { fragments?: string[] } | undefined;
  const result = props.result as { loaded_fragment_ids?: string[] } | undefined;
  const ids = result?.loaded_fragment_ids ?? args?.fragments ?? [];
  const labels = ids
    .map((id) => FRAGMENT_ZH[id] ?? id)
    .filter(Boolean)
    .join("、");
  return harnessRow(
    "出行说明",
    labels ? `已载入：${labels}` : "已载入说明片段",
    "具体规则由助手在回复中使用，此处不展开原文。",
  );
}

export function WriteOutingTodosToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) {
    return harnessRow("任务步骤", "记录失败，请重试。");
  }
  if (isLoading(props)) {
    return harnessRow("任务步骤", "正在记录当前计划…");
  }
  const result = props.result as { items?: unknown[] } | undefined;
  const n = Array.isArray(result?.items) ? result!.items!.length : 0;
  return harnessRow(
    "任务步骤",
    n > 0 ? `已更新 ${n} 条步骤` : "已更新任务步骤",
    "步骤详情由助手在对话中说明，此处不列出清单。",
  );
}

export function CompactSessionContextToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) {
    return harnessRow("上下文", "整理失败，请重试。");
  }
  if (isLoading(props)) {
    return harnessRow("上下文", "正在整理会话摘要…");
  }
  return harnessRow(
    "上下文",
    "已整理会话摘要（供助手继续推理）",
    "完整快照已写入服务端存档；界面不展开技术细节。",
  );
}

export function RunPlanningSubtaskToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) {
    return harnessRow("子任务", "子任务执行失败，请重试或缩小任务范围。");
  }
  if (isLoading(props)) {
    return harnessRow("子任务", "正在独立上下文里调研…");
  }
  const result = props.result as { summary?: string } | undefined;
  const preview = (result?.summary ?? "").trim().slice(0, 120);
  return harnessRow(
    "子任务",
    preview ? `已完成，要点：${preview}${(result?.summary?.length ?? 0) > 120 ? "…" : ""}` : "子任务已完成",
    "中间工具链不展示；请查看助手下文的正式说明。",
  );
}

export function CheckRestaurantAvailabilityToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("可预订时段", "查询失败，请稍后重试。");
  if (isLoading(props)) return harnessRow("可预订时段", "正在查询可预订时段…");
  const r = props.result as
    | {
        poi_name?: string;
        recommended_slot_id?: string;
        slots?: { start_time_iso: string; available_seats: number }[];
        waitlist?: { eta_minutes?: number; queue_position?: number };
      }
    | undefined;
  if (!r) return null;
  const slotCount = r.slots?.length ?? 0;
  const waitMin = r.waitlist?.eta_minutes ?? 0;
  return harnessRow(
    `可预订时段 · ${r.poi_name ?? ""}`,
    `${slotCount} 个候选时段${r.recommended_slot_id ? `，推荐 ${r.recommended_slot_id}` : ""}`,
    waitMin > 0 ? `预计等位 ${waitMin} 分钟（队列第 ${r.waitlist?.queue_position} 位）` : "无需排队",
  );
}

export function GetLocalWeatherToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("天气", "天气查询失败。");
  if (isLoading(props)) return harnessRow("天气", "正在查询天气…");
  const r = props.result as
    | { summary?: string; high_temp_c?: number; low_temp_c?: number; prefer_indoor?: boolean }
    | undefined;
  if (!r) return null;
  return harnessRow(
    "天气",
    r.summary ?? "已获取天气",
    `${r.low_temp_c ?? "?"}°C ~ ${r.high_temp_c ?? "?"}°C${r.prefer_indoor ? " · 建议室内" : ""}`,
  );
}

export function ValidateGeoEnvelopeToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("离家距离校验", "校验失败。");
  if (isLoading(props)) return harnessRow("离家距离校验", "正在校验距离…");
  const r = props.result as
    | { feasible?: boolean; max_travel_km?: number; violations?: { poi_id: string; distance_km: number }[] }
    | undefined;
  if (!r) return null;
  if (r.feasible) {
    return harnessRow(
      "离家距离校验",
      `全部 POI 都在 ${r.max_travel_km}km 以内 ✓`,
    );
  }
  const v = r.violations ?? [];
  return harnessRow(
    "离家距离校验",
    `有 ${v.length} 个 POI 超出 ${r.max_travel_km}km`,
    v.slice(0, 3).map((x) => `${x.poi_id} (${x.distance_km}km)`).join(" · "),
  );
}

export function CalculateTransitRouteToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("路线", "路线计算失败。");
  if (isLoading(props)) return harnessRow("路线", "正在串联多 POI 路线…");
  const r = props.result as
    | { total_distance_km?: number; total_duration_minutes?: number; legs?: unknown[] }
    | undefined;
  if (!r) return null;
  return harnessRow(
    "路线",
    `${r.legs?.length ?? 0} 段 · 共 ${r.total_distance_km ?? 0}km · 约 ${r.total_duration_minutes ?? 0} 分钟`,
  );
}

export function OptimizeVisitOrderToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("访问顺序", "优化失败。");
  if (isLoading(props)) return harnessRow("访问顺序", "正在排顺序…");
  const r = props.result as
    | { ordered_poi_ids?: string[]; total_distance_km?: number }
    | undefined;
  if (!r) return null;
  return harnessRow(
    "访问顺序",
    `${r.ordered_poi_ids?.length ?? 0} 站 · 总路程 ${r.total_distance_km ?? 0}km`,
    r.ordered_poi_ids?.join(" → "),
  );
}

export function ProposePlanAlternativesToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("备选方案", "生成失败。");
  if (isLoading(props)) return harnessRow("备选方案", "正在生成 A/B 备选…");
  const r = props.result as
    | {
        base_title?: string;
        options?: { option_id: string; title: string; tagline: string; total_estimated_cost_cny: number }[];
        recommended_option_id?: string;
      }
    | undefined;
  if (!r) return null;
  const lines = (r.options ?? [])
    .map(
      (o) =>
        `${o.option_id === r.recommended_option_id ? "★ " : ""}${o.title}（¥${o.total_estimated_cost_cny}）— ${o.tagline}`,
    )
    .join("\n");
  return harnessRow(
    `备选方案 · ${r.base_title ?? ""}`,
    `${r.options?.length ?? 0} 个备选，推荐 ${r.recommended_option_id ?? "-"}`,
    lines,
  );
}

export function ScheduleReminderToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("提醒", "添加失败。");
  if (isLoading(props)) return harnessRow("提醒", "正在写入通知中心…");
  const r = props.result as { scheduled?: { title: string; fire_at_iso: string }[] } | undefined;
  if (!r) return null;
  const list = (r.scheduled ?? [])
    .slice(0, 3)
    .map((s) => `${new Date(s.fire_at_iso).toLocaleString("zh-CN")} · ${s.title}`)
    .join("\n");
  return harnessRow(
    "提醒",
    `已添加 ${r.scheduled?.length ?? 0} 条到通知中心（右上角铃铛可见）`,
    list,
  );
}

export function FindGroupBuyDealToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("团购套餐", "查询失败。");
  if (isLoading(props)) return harnessRow("团购套餐", "正在查询团购…");
  const r = props.result as
    | { poi_name?: string; deals?: { title: string; deal_cny: number; savings_cny: number; coupon_code_for_apply: string }[] }
    | undefined;
  if (!r) return null;
  const lines = (r.deals ?? [])
    .map((d) => `${d.title} · ¥${d.deal_cny}（省 ¥${d.savings_cny}） · ${d.coupon_code_for_apply}`)
    .join("\n");
  return harnessRow(
    `团购套餐 · ${r.poi_name ?? ""}`,
    r.deals?.length ? `${r.deals.length} 个套餐` : "暂无团购套餐",
    lines,
  );
}

export function ApplyCouponToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("券校验", "校验失败。");
  if (isLoading(props)) return harnessRow("券校验", "正在校验优惠券…");
  const r = props.result as
    | { applicable?: boolean; discount_cny?: number; final_amount_cny?: number; reason?: string }
    | undefined;
  if (!r) return null;
  return harnessRow(
    "券校验",
    r.applicable ? `已抵扣 ¥${r.discount_cny ?? 0} → 实付 ¥${r.final_amount_cny ?? 0}` : "不适用",
    r.reason,
  );
}

export function MockPayViaWalletToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("Mock 支付", "支付失败。");
  if (isLoading(props)) return harnessRow("Mock 支付", "正在支付…");
  const r = props.result as
    | { status?: string; amount_cny?: number; channel?: string; receipt_id?: string }
    | undefined;
  if (!r) return null;
  return harnessRow(
    "Mock 支付",
    `${r.status === "paid" ? "已支付" : "处理中"} · ¥${r.amount_cny ?? 0}（${r.channel ?? ""}）`,
    r.receipt_id ? `小票 ${r.receipt_id}` : undefined,
  );
}

export function BookTaxiToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("打车询价", "询价失败。");
  if (isLoading(props)) return harnessRow("打车询价", "正在询价…");
  const r = props.result as
    | {
        origin_label?: string;
        destination_label?: string;
        fare_estimate_cny?: number;
        estimated_duration_minutes?: number;
        driver_eta_minutes?: number;
        surge_multiplier?: number;
      }
    | undefined;
  if (!r) return null;
  return harnessRow(
    "打车询价",
    `${r.origin_label ?? ""} → ${r.destination_label ?? ""} · ¥${r.fare_estimate_cny ?? 0}`,
    `${r.estimated_duration_minutes ?? 0}min · 司机 ${r.driver_eta_minutes ?? 0}min 内到${
      (r.surge_multiplier ?? 1) > 1 ? ` · 高峰 ×${r.surge_multiplier}` : ""
    }`,
  );
}

export function ModifyReservationToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("改签", "改签失败。");
  if (isLoading(props)) return harnessRow("改签", "正在改签…");
  const r = props.result as
    | { cancelled_mock_order_ref?: string; new_mock_order_ref?: string; message?: string }
    | undefined;
  if (!r) return null;
  return harnessRow(
    "改签",
    r.message ?? `${r.cancelled_mock_order_ref} → ${r.new_mock_order_ref}`,
  );
}

export function FetchShareFeedbackToolUI(
  props: ToolCallMessagePartProps<Record<string, unknown>, unknown>,
) {
  if (props.isError) return harnessRow("亲友反馈", "拉取失败。");
  if (isLoading(props)) return harnessRow("亲友反馈", "正在拉取亲友反馈…");
  const r = props.result as
    | {
        total?: number;
        by_reaction?: { thumbs_up: number; thumbs_down: number; neutral: number };
        comments?: { reviewer_label?: string; reaction: string; comment?: string }[];
      }
    | undefined;
  if (!r) return null;
  const recent = (r.comments ?? [])
    .slice(0, 3)
    .map((c) => `${c.reviewer_label ?? "亲友"}（${c.reaction}）：${c.comment ?? ""}`)
    .join("\n");
  return harnessRow(
    "亲友反馈",
    r.total
      ? `共 ${r.total} 条 · 喜欢 ${r.by_reaction?.thumbs_up ?? 0} · 想换 ${r.by_reaction?.thumbs_down ?? 0}`
      : "暂无反馈",
    recent || undefined,
  );
}
