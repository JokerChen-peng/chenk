"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { ContinuePlanFromQuery } from "@/components/chat/continue-plan-from-query";
import {
  Composer,
  Thread,
  ThreadConfigProvider,
  type ThreadConfig,
  ThreadList,
  ThreadWelcome,
} from "@assistant-ui/react-ui";
import { AssistantMarkdownText } from "@/components/chat/assistant-markdown-text";
import { AssistantMessageEmpty } from "@/components/chat/assistant-message-empty";
import { ChatStreamErrorBanner } from "@/components/chat/chat-stream-error-banner";
import { HumanInLoopToolFallback } from "@/components/chat/human-in-loop-tool-fallback";
import { BuildStructuredItineraryToolUI } from "@/components/chat/tools/build-structured-itinerary-tool-ui";
import { CalculateTransitMatrixToolUI } from "@/components/chat/tools/calculate-transit-matrix-tool-ui";
import { ExecuteTransactionBatchToolUI } from "@/components/chat/tools/execute-transaction-batch-tool-ui";
import { ExecuteTransactionToolUI } from "@/components/chat/tools/execute-transaction-tool-ui";
import { ParseOutingConstraintsToolUI } from "@/components/chat/tools/parse-outing-constraints-tool-ui";
import { ProposePlanAlternativesToolUI } from "@/components/chat/tools/propose-plan-alternatives-tool-ui";
import { SearchEnhancedPoiToolUI } from "@/components/chat/tools/search-enhanced-poi-tool-ui";
import { ShareOutingSummaryToolUI } from "@/components/chat/tools/share-outing-summary-tool-ui";
import { ValidateTimelineFeasibilityToolUI } from "@/components/chat/tools/validate-timeline-feasibility-tool-ui";
import {
  ApplyCouponToolUI,
  BookTaxiToolUI,
  CalculateTransitRouteToolUI,
  CheckRestaurantAvailabilityToolUI,
  CompactSessionContextToolUI,
  FetchShareFeedbackToolUI,
  FindGroupBuyDealToolUI,
  GetLocalWeatherToolUI,
  LoadOutingSkillToolUI,
  MockPayViaWalletToolUI,
  ModifyReservationToolUI,
  OptimizeVisitOrderToolUI,
  RunPlanningSubtaskToolUI,
  ScheduleReminderToolUI,
  ValidateGeoEnvelopeToolUI,
  WriteOutingTodosToolUI,
} from "@/components/chat/tools/internal-harness-tool-uis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HomeLocationPill } from "@/components/chat/home-location-pill";

const generativeToolUIs = [
  makeAssistantToolUI({
    toolName: "parse_outing_constraints",
    render: ParseOutingConstraintsToolUI,
  }),
  makeAssistantToolUI({
    toolName: "search_enhanced_poi",
    render: SearchEnhancedPoiToolUI,
  }),
  makeAssistantToolUI({
    toolName: "calculate_transit_matrix",
    render: CalculateTransitMatrixToolUI,
  }),
  makeAssistantToolUI({
    toolName: "validate_timeline_feasibility",
    render: ValidateTimelineFeasibilityToolUI,
  }),
  makeAssistantToolUI({
    toolName: "build_structured_itinerary",
    render: BuildStructuredItineraryToolUI,
  }),
  makeAssistantToolUI({
    toolName: "execute_transaction",
    render: ExecuteTransactionToolUI,
  }),
  makeAssistantToolUI({
    toolName: "execute_transaction_batch",
    render: ExecuteTransactionBatchToolUI,
  }),
  makeAssistantToolUI({
    toolName: "share_outing_summary",
    render: ShareOutingSummaryToolUI,
  }),
  makeAssistantToolUI({
    toolName: "load_outing_skill",
    render: LoadOutingSkillToolUI,
  }),
  makeAssistantToolUI({
    toolName: "write_outing_todos",
    render: WriteOutingTodosToolUI,
  }),
  makeAssistantToolUI({
    toolName: "compact_session_context",
    render: CompactSessionContextToolUI,
  }),
  makeAssistantToolUI({
    toolName: "run_planning_subtask",
    render: RunPlanningSubtaskToolUI,
  }),
  makeAssistantToolUI({
    toolName: "check_restaurant_availability",
    render: CheckRestaurantAvailabilityToolUI,
  }),
  makeAssistantToolUI({
    toolName: "get_local_weather",
    render: GetLocalWeatherToolUI,
  }),
  makeAssistantToolUI({
    toolName: "validate_geo_envelope",
    render: ValidateGeoEnvelopeToolUI,
  }),
  makeAssistantToolUI({
    toolName: "calculate_transit_route",
    render: CalculateTransitRouteToolUI,
  }),
  makeAssistantToolUI({
    toolName: "optimize_visit_order",
    render: OptimizeVisitOrderToolUI,
  }),
  makeAssistantToolUI({
    toolName: "propose_plan_alternatives",
    render: ProposePlanAlternativesToolUI,
  }),
  makeAssistantToolUI({
    toolName: "schedule_reminder",
    render: ScheduleReminderToolUI,
  }),
  makeAssistantToolUI({
    toolName: "find_group_buy_deal",
    render: FindGroupBuyDealToolUI,
  }),
  makeAssistantToolUI({
    toolName: "apply_coupon",
    render: ApplyCouponToolUI,
  }),
  makeAssistantToolUI({
    toolName: "mock_pay_via_meituan_wallet",
    render: MockPayViaWalletToolUI,
  }),
  makeAssistantToolUI({
    toolName: "book_taxi",
    render: BookTaxiToolUI,
  }),
  makeAssistantToolUI({
    toolName: "modify_reservation",
    render: ModifyReservationToolUI,
  }),
  makeAssistantToolUI({
    toolName: "fetch_share_feedback",
    render: FetchShareFeedbackToolUI,
  }),
];

const chatThreadConfig = {
  strings: {
    threadList: {
      new: { label: "新对话" },
      item: {
        title: { fallback: "未命名对话" },
        archive: { tooltip: "归档" },
      },
    },
  },
  /** 单线对话：先提问，助手在下方气泡回复；不展示「分支 / 1 of 2」切换条 */
  branchPicker: { allowBranchPicker: false },
  /** 不在用户气泡旁显示编辑铅笔（避免误以为要点分支） */
  userMessage: { allowEdit: false },
  /** 空会话时的说明：输入在底部输入框 */
  welcome: {
    message:
      "在底部输入框发送问题；你的消息和助手的回复会按时间顺序出现在中间区域，紧挨在彼此之后。",
    suggestions: [],
  },
  tools: generativeToolUIs,
  assistantMessage: {
    components: {
      ToolFallback: HumanInLoopToolFallback,
      Text: AssistantMarkdownText,
      Empty: AssistantMessageEmpty,
    },
  },
  components: {
    MessagesFooter: ContinuePlanFromQuery,
  },
} satisfies ThreadConfig;

/**
 * Assistant UI thread state (empty vs messages) differs between SSR and client,
 * which caused ThreadWelcome hydration mismatches. This module is only loaded
 * client-side via `next/dynamic` with `ssr: false` from the home page.
 */
export default function ChatScreen() {
  return (
    <ThreadConfigProvider config={chatThreadConfig}>
      <div className="mx-auto flex h-[85vh] w-full max-w-6xl flex-col gap-4 md:flex-row md:items-stretch">
        <aside className="flex shrink-0 flex-col md:w-56">
          <p className="mb-1 text-xs font-medium text-muted-foreground md:px-1">
            会话列表
          </p>
          <ThreadList.Root className="flex max-h-36 min-h-0 flex-col rounded-xl border border-border/60 bg-card/50 p-2 md:max-h-none md:flex-1">
            <ThreadList.New />
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-0.5">
              <ThreadList.Items />
            </div>
          </ThreadList.Root>
        </aside>
        <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-border/70 bg-card/90 shadow-lg">
          <CardHeader className="flex flex-col gap-3 border-b border-border/70 py-4">
            <CardTitle className="text-base font-semibold">
              Mastra Assistant
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · 规划与执行同一对话；可生成亲友只读链接；确认后可单笔或一键多笔 Mock
              </span>
            </CardTitle>
            <HomeLocationPill />
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <ChatStreamErrorBanner />
            <div className="min-h-0 flex-1 [&_.aui-thread-root]:h-full">
              <Thread.Root>
                <Thread.Viewport>
                  <ThreadWelcome />
                  <Thread.Messages MessagesFooter={ContinuePlanFromQuery} />
                  <Thread.FollowupSuggestions />
                  <Thread.ViewportFooter>
                    <Thread.ScrollToBottom />
                    <Composer />
                  </Thread.ViewportFooter>
                </Thread.Viewport>
              </Thread.Root>
            </div>
          </CardContent>
        </Card>
      </div>
    </ThreadConfigProvider>
  );
}
