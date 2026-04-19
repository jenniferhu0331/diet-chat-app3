/**
 * 統一匯出點。
 * route.ts 只需 import from "@/lib/prompts"。
 */
export { PERSONA } from "./persona";
export { SAFETY_RULES } from "./safety";

export {
  buildIntentClassifierPrompt,
  ALL_INTENTS,
  type Intent,
} from "./classifiers/intent";

export {
  buildSafetyCheckPrompt,
  buildReviseReplyPrompt,
  type SafetyResult,
  type SafetyRisk,
} from "./classifiers/safety-check";

export { buildGeneralChatPrompt } from "./states/general-chat";
export { buildEmotionalSupportPrompt } from "./states/emotional-support";
export { buildEmotionalEatingPrompt } from "./states/emotional-eating";
export { buildMealLoggingPrompt } from "./states/meal-logging";
export { buildPlanRequestPrompt } from "./states/plan-request";
export {
  buildRestaurantNoResultsPrompt,
  buildRestaurantCardsPrompt,
} from "./states/restaurant-search";
export {
  EVENING_CHECKIN_HINT,
  isEveningHour,
} from "./states/evening-checkin";

export {
  buildCompensationPlanPrompt,
  type CompensationPlan,
  type CompensationDay,
  type CompensationMeal,
} from "./tools/compensation";

export {
  buildSummaryPrompt,
  formatSummaryAsContext,
  type DailySummary,
} from "./tools/summary";

import { PERSONA } from "./persona";
import { SAFETY_RULES } from "./safety";

/**
 * 組合人格 + 安全規則，作為所有 state prompt 的共用前綴。
 */
export const SYSTEM_PREFIX = `${PERSONA}\n\n${SAFETY_RULES}`;

/**
 * 向後相容：舊程式碼用的 SYSTEM_PROMPT（如果有地方還在直接 import 這個）。
 * 新程式碼應該用 SYSTEM_PREFIX + 對應 state 的 build*Prompt。
 */
export const SYSTEM_PROMPT = SYSTEM_PREFIX;
