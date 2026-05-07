import { Agent } from "@mastra/core/agent";
import {
  applyCouponTool,
  buildStructuredItineraryTool,
  calculateTransitMatrixTool,
  calculateTransitRouteTool,
  checkRestaurantAvailabilityTool,
  bookTaxiTool,
  compactSessionContextTool,
  fetchShareFeedbackTool,
  findGroupBuyDealTool,
  getLocalWeatherTool,
  loadOutingSkillTool,
  optimizeVisitOrderTool,
  parseOutingConstraintsTool,
  proposePlanAlternativesTool,
  runPlanningSubtaskTool,
  scheduleReminderTool,
  searchEnhancedPoiTool,
  shareOutingSummaryTool,
  validateGeoEnvelopeTool,
  validateTimelineFeasibilityTool,
  writeOutingTodosTool,
} from "@/src/mastra/tools";
import { loadAgentPrompt } from "@/prompts/load";
import { resolveAgentModel } from "@/src/infra/agent-model";
import { getSharedMemory } from "@/src/infra/mastra-memory";

const PLANNING_AGENT_SYSTEM_PROMPT = loadAgentPrompt("planning-agent");

export const planningAgent = new Agent({
  id: "planningAgent",
  name: "Local Life Planning Agent",
  instructions: PLANNING_AGENT_SYSTEM_PROMPT,
  model: resolveAgentModel(),
  memory: getSharedMemory(),
  tools: {
    write_outing_todos: writeOutingTodosTool,
    run_planning_subtask: runPlanningSubtaskTool,
    compact_session_context: compactSessionContextTool,
    load_outing_skill: loadOutingSkillTool,
    parse_outing_constraints: parseOutingConstraintsTool,
    get_local_weather: getLocalWeatherTool,
    search_enhanced_poi: searchEnhancedPoiTool,
    check_restaurant_availability: checkRestaurantAvailabilityTool,
    find_group_buy_deal: findGroupBuyDealTool,
    apply_coupon: applyCouponTool,
    book_taxi: bookTaxiTool,
    calculate_transit_matrix: calculateTransitMatrixTool,
    calculate_transit_route: calculateTransitRouteTool,
    optimize_visit_order: optimizeVisitOrderTool,
    validate_geo_envelope: validateGeoEnvelopeTool,
    validate_timeline_feasibility: validateTimelineFeasibilityTool,
    propose_plan_alternatives: proposePlanAlternativesTool,
    build_structured_itinerary: buildStructuredItineraryTool,
    schedule_reminder: scheduleReminderTool,
    share_outing_summary: shareOutingSummaryTool,
    fetch_share_feedback: fetchShareFeedbackTool,
  },
  defaultGenerateOptionsLegacy: {
    maxSteps: 16,
  },
  defaultStreamOptionsLegacy: {
    maxSteps: 16,
  },
});
