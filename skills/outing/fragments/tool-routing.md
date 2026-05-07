# 工具调用顺序与要点（v2，含餐厅可用时段 / 天气 / 备选 / 反馈 / 提醒 / 团购）

1. **大块探路（可选 s04）**：多分支比选、长链路预研且不想刷爆主会话时，用 **`run_planning_subtask`**（`objective` + 可选 `hints`）。
2. **首轮或尽早**：`parse_outing_constraints` → 自然语言 → 结构化约束 + `time_semantics` + `participants` + `dietary_filters` + `inferred_home_adcode` 等。

   **重要：你（LLM）才是这一步的主力 NLU**。工具内部的 regex 只覆盖最常见说法，碰到「周末 / 5月2日 / 五一 / 春节 / 礼拜六 / 带女朋友 / 一家四口 / 带爸妈 / 不吃辣 / 海鲜过敏 / 戒酒 / 桌游 / 密室 / 演唱会 / 现在 / 下班后 / 下午三点到晚上九点 / 六点半」之类的说法 regex **几乎都识别不了**。所以：

   - 你必须自己读完 `user_message`，把能确认的字段填进 `parsed_overrides`：
     - `scene`（family / friends / solo / unknown）
     - `party_size`、`participants`（含 role/gender/age/preferences）
     - `outing_date`（YYYY-MM-DD，Asia/Shanghai）、`window_label`、`window_clock_start`、`window_clock_end`
     - `duration_hours_target`
     - `dietary_filters`、`activity_hints`、`suggested_category_matrix`
     - `budget_hint_cny`、`max_travel_km_from_home`
   - 不确定的字段就**别填**，让 regex baseline 兜底（它会用一个还能用的默认值，至少不会编瞎话）。
   - `user_message` 仍然要原样传，作为兜底 + UI「需求理解」卡片副本。

   **多轮变更必须重 parse**：用户在后续轮次里说「预算很足 / 改成下周 / 加一个朋友 / 不要去酒吧 / 改吃中餐」等任何修改约束的话时，**必须**重新调用 `parse_outing_constraints`，把变化项写进 `parsed_overrides`，再继续后面的 search / build。不要只在脑子里改。
3. **天气**：要规划 4–6 小时下午活动时，先 `get_local_weather`（adcode + outing_date）；若 `prefer_indoor === true`，把它传给 `search_enhanced_poi.prefer_indoor`，并优先选 `indoor` 标签的 POI。
4. **搜点**：`search_enhanced_poi` —
   - `adcode_boundary` 用 parse 的 `inferred_home_adcode`；
   - `category_matrix` 用 `suggested_category_matrix`；
   - **务必**把 `dietary_filters`、`party_size`、`scene`、`max_travel_km_from_home` 一并传入；
   - 必要时 `subcategory_filters`（例如「只要博物馆」`["博物馆"]`，「citywalk 小吃街」`["citywalk_food_street"]`）。
5. **餐厅可用时段**：选好备选餐厅后用 **`check_restaurant_availability`**（poi_id + party_size + desired_time_iso），拿到 `slots[].slot_id` 与 `waitlist`；建议把 `recommended_slot_id` / `available_seats` 写到对应 segment.notes。
6. **多 POI 顺序**：≥3 个 POI 时先 `optimize_visit_order` 拿排序，再 `calculate_transit_route` 整段串联；两点之间微调再用 `calculate_transit_matrix`。
7. **离家硬约束**：`validate_geo_envelope` 校验全部候选 POI 是否落在 `max_travel_km_from_home` 内；如果 violations 非空，要么换 POI 要么与用户确认放宽。
8. **打车**：用户说要打车或方案需要打车段时，`book_taxi` 询价（不是真下单），把 fare_estimate 写进 segment 备注。
9. **预算与时间窗**：`validate_timeline_feasibility` 已被 build_structured_itinerary 内嵌；定稿前各段 `start_time_iso` / `end_time_iso` 必须落在 parse 的 `window_start_iso ~ window_end_iso` 内，且 `outing_date` 一致。
10. **团购券**：选餐厅时调 `find_group_buy_deal` 看 POI 是否有套餐；命中就把 `coupon_code_for_apply`（如 `GB-DEAL-XXX`）写进对应执行操作的 `coupon.code`，让执行 Agent 通过 `apply_coupon` 校验后抵扣。
11. **A/B 备选**：用户说「给老婆/朋友选」「想要几个版本」时调 `propose_plan_alternatives`（2–4 个 option，每个 option 含 segments）。
12. **定稿**：`build_structured_itinerary` —
   - 每个 segment **必须**带 `estimated_cost_cny`（人均 × party_size 之和）；
   - 把 `budget_total_cny` 传入做硬校验；
   - 可选 `reminders`（出发前 60/30 分钟）让前端写入通知中心。
13. **出行提醒**：`schedule_reminder` 也可以追加（接孩子、结账提醒等）。
14. **分享**：`share_outing_summary` 默认 `link_only`，仅当用户明确「假装已发微信/短信」时用 `wechat_mock` / `sms_mock`；分享后把 `share_token` 记下，方便后续 `fetch_share_feedback`。
15. **拉反馈**：用户问「老婆怎么说」「小张回复了吗」时，用 `fetch_share_feedback(share_token)`，根据 thumbs_down / 留言再调整方案。
16. **失败兜底**：分析原因 → 调整参数 → 重试；仍不可行则说明原因与最小修改建议。
