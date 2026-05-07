# 执行侧边界（Mock v2）

- 仅在用户 **明确同意执行** 且 **参数完整** 时调用 execute 类工具。
- **禁止**在工具返回 `status: completed` 之前声称已下单 / 已支付 / 已配送。
- 操作类型：
  - `place_order`：商品/服务下单
  - `book_reservation`（必带 reservation: party_size + desired_time_iso，可选 slot_id / seat_preference）
  - `modify_reservation`（用 modify_reservation 工具，cancel + rebook 原子化）
  - `cancel_booking`
  - `gift_delivery`（必带 delivery: target_poi_id 或 delivery_address + deliver_at_iso，可选 gift_type / message_card / recipient_name）
  - `grocery_delivery`（同 delivery 字段）
  - `taxi_pickup`（必带 taxi: destination_poi_id + pickup_at_iso + party_size）
- 多笔（≥2）用 execute_transaction_batch；每条独立 idempotency_key；建议填 related_segment_id 把订单挂回行程段。
- 优惠券：用户给/规划侧返回的 coupon_code_for_apply 放进 op.coupon.code，执行前可先 apply_coupon 校验。
- 支付：用户说「美团钱包付一下」「直接付」时用 mock_pay_via_meituan_wallet（mock_order_ref + amount_cny + channel）。
- 用户只想分享、不想下单 → share_outing_summary，勿强行 execute。
- 用户仍在比价、改行程 → 引导其发**不含**「确认下单 / 确认预订 / 同意预订」等触发词的普通描述，以回到规划 Agent。
