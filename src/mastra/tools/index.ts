/**
 * 24 个 mastra 工具按领域分组的总入口。Agents 和 CLI 都从这里取。
 *
 * 子目录约定：
 *   nlu/         自然语言 → 结构化（约束、时间、ISO 强制）
 *   discover/    查 POI / 团购 / 餐厅可用性 / 天气
 *   routing/     地理 / 距离矩阵 / 路线 / 顺序优化 / 包络
 *   constraints/ 行程节点合法性 / 时间重叠
 *   authoring/   组装行程 / 候选方案 / 分享文案
 *   execution/   交易：下单 / 改单 / 团购 / 优惠券 / 打车 / 支付
 *   follow-up/   下游通知：提醒 / 反馈
 *   meta/        agent 自身：拆子任务 / 压缩上下文 / 加载技能 / 写 todo
 */

// nlu
export { parseOutingConstraintsTool } from "./nlu/parse-outing-constraints";

// discover
export { searchEnhancedPoiTool } from "./discover/search-enhanced-poi";
export { getLocalWeatherTool } from "./discover/get-local-weather";
export { findGroupBuyDealTool } from "./discover/find-group-buy-deal";
export { checkRestaurantAvailabilityTool } from "./discover/check-restaurant-availability";

// routing
export { calculateTransitMatrixTool } from "./routing/calculate-transit-matrix";
export { calculateTransitRouteTool } from "./routing/calculate-transit-route";
export { optimizeVisitOrderTool } from "./routing/optimize-visit-order";
export { validateGeoEnvelopeTool } from "./routing/validate-geo-envelope";

// constraints
export { validateTimelineFeasibilityTool } from "./constraints/validate-timeline-feasibility";

// authoring
export { buildStructuredItineraryTool } from "./authoring/build-structured-itinerary";
export { proposePlanAlternativesTool } from "./authoring/propose-plan-alternatives";
export { shareOutingSummaryTool } from "./authoring/share-outing-summary";

// execution
export { executeTransactionTool } from "./execution/execute-transaction";
export { executeTransactionBatchTool } from "./execution/execute-transaction-batch";
export { modifyReservationTool } from "./execution/modify-reservation";
export { applyCouponTool } from "./execution/apply-coupon";
export { mockPayViaMeituanWalletTool } from "./execution/mock-pay-via-meituan-wallet";
export { bookTaxiTool } from "./execution/book-taxi";

// follow-up
export { scheduleReminderTool } from "./follow-up/schedule-reminder";
export { fetchShareFeedbackTool } from "./follow-up/fetch-share-feedback";

// meta
export { writeOutingTodosTool } from "./meta/write-outing-todos";
export { compactSessionContextTool } from "./meta/compact-session-context";
export { runPlanningSubtaskTool } from "./meta/run-planning-subtask";
export { loadOutingSkillTool } from "./meta/load-outing-skill";
