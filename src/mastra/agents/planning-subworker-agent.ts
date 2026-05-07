import { Agent } from "@mastra/core/agent";
import {
  buildStructuredItineraryTool,
  calculateTransitMatrixTool,
  calculateTransitRouteTool,
  checkRestaurantAvailabilityTool,
  compactSessionContextTool,
  fetchShareFeedbackTool,
  findGroupBuyDealTool,
  getLocalWeatherTool,
  loadOutingSkillTool,
  optimizeVisitOrderTool,
  parseOutingConstraintsTool,
  proposePlanAlternativesTool,
  searchEnhancedPoiTool,
  shareOutingSummaryTool,
  validateGeoEnvelopeTool,
  validateTimelineFeasibilityTool,
  writeOutingTodosTool,
} from "@/src/mastra/tools";
import { loadAgentPrompt } from "@/prompts/load";
import { resolveAgentModel } from "@/src/infra/agent-model";
import { getSharedMemory } from "@/src/infra/mastra-memory";

const PLANNING_SUBWORKER_SYSTEM_PROMPT = loadAgentPrompt(
  "planning-subworker-agent",
);

export const planningWorkerAgent = new Agent({
  id: "planningWorkerAgent",
  name: "Outing Planning Sub-worker",
  instructions: PLANNING_SUBWORKER_SYSTEM_PROMPT,
  model: resolveAgentModel(),
  memory: getSharedMemory(),
  tools: {
    write_outing_todos: writeOutingTodosTool,
    compact_session_context: compactSessionContextTool,
    load_outing_skill: loadOutingSkillTool,
    parse_outing_constraints: parseOutingConstraintsTool,
    get_local_weather: getLocalWeatherTool,
    search_enhanced_poi: searchEnhancedPoiTool,
    check_restaurant_availability: checkRestaurantAvailabilityTool,
    find_group_buy_deal: findGroupBuyDealTool,
    calculate_transit_matrix: calculateTransitMatrixTool,
    calculate_transit_route: calculateTransitRouteTool,
    optimize_visit_order: optimizeVisitOrderTool,
    validate_geo_envelope: validateGeoEnvelopeTool,
    validate_timeline_feasibility: validateTimelineFeasibilityTool,
    propose_plan_alternatives: proposePlanAlternativesTool,
    build_structured_itinerary: buildStructuredItineraryTool,
    share_outing_summary: shareOutingSummaryTool,
    fetch_share_feedback: fetchShareFeedbackTool,
  },
  defaultGenerateOptionsLegacy: {
    maxSteps: 14,
  },
  defaultStreamOptionsLegacy: {
    maxSteps: 14,
  },
});
