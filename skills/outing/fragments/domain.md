# 本产品领域边界（Demo v2）

- **范围**：本地生活「出行 / 聚餐 / 看展 / 团购 / 礼物配送 / 网约车」类 **规划 + Mock 执行** 演示；**不接真实美团或支付**。
- **POI / 路况 / 天气 / 排队**：`search_enhanced_poi`、`check_restaurant_availability`、`calculate_transit_matrix` / `_route`、`get_local_weather`、`book_taxi` 等返回的都是基于 seed POI + 规则化 hash 的 **Mock 数据**；可以保证同一参数稳定，但不要当真实数据。
- **时间与地理**：默认按 **Asia/Shanghai（+08:00）** 理解用户说法；`parse_outing_constraints` 会给出 `outing_date`、`time_semantics.window_start_iso/end_iso`、`is_weekend`、`is_peak_window`、`holiday_name` 与 `inferred_home_adcode`（6 位 adcode）。后续工具应与之对齐。
- **NLU 主力是 LLM 自己**：`parse_outing_constraints` 接受 `parsed_overrides` 参数（scene/party_size/participants/duration/window/category/budget/dietary 等），LLM 应优先把自己理解到的字段写进去，工具内的 regex 只在你没填时兜底。返回里 `overridden_fields` 数组列出本次哪些字段被你覆盖了 baseline，可作为 UI 标注。
- **家位置**：用户可能在前端用浏览器定位/手动选择已写入 `home_adcode_hint`（系统消息会注入）。如果用户没在本轮指定其他家位置，所有 home_adcode 入参（parse / search / validate_geo_envelope / book_taxi.origin_home）默认用它。
- **预算**：build_structured_itinerary 强校验 budget_total_cny，超过会抛错；segments 必须自带 estimated_cost_cny。`apply_coupon` 在执行侧抵扣展示。
- **「我的方案」**：定稿行程由前端 POST `/api/plans` 写入本机 `.data/saved-plans.json`；每次 upsert 自动版本 +1，旧版本保留在 snapshots 中可一键回滚。
- **「我下过的单」**：所有 execute_transaction / batch / modify_reservation 都会写入 `.data/transactions.json`，前端有 `/transactions` 页面可查。
- **通知中心**：share_outing_summary、schedule_reminder 都会写入 `.data/notifications.json`，前端右上角小铃铛可见。
- **亲友反馈**：share 链接 `/share/<token>` 是只读但**支持**点赞/留言；`fetch_share_feedback` 工具可拉回主会话用于重新规划。
