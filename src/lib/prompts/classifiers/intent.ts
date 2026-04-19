/**
 * 意圖分類器 prompt。
 * 輸出 JSON：{ intent, reason }
 */

export type Intent =
  | "emotional_support"   // 一般情緒（疲累、低落、需要被理解）
  | "emotional_eating"    // 情緒性進食或無法拒絕的聚餐壓力
  | "meal_logging"        // 描述剛吃/今天吃的東西
  | "plan_request"        // 要求餐單、補償計畫、明天怎麼吃
  | "restaurant_search"   // 明確要求找附近店家
  | "general_chat";       // 寒暄、追問、延續聊天

export const ALL_INTENTS: Intent[] = [
  "emotional_support",
  "emotional_eating",
  "meal_logging",
  "plan_request",
  "restaurant_search",
  "general_chat",
];

export function buildIntentClassifierPrompt(params: {
  message: string;
  historyText: string;
}) {
  return `
你是一個對話意圖分類器。
請根據使用者最新訊息與對話上下文，判斷這句話的主要意圖。

分類只能是以下其中一個：
- emotional_support
- emotional_eating
- meal_logging
- plan_request
- restaurant_search
- general_chat

判斷原則：
1. 若使用者表達疲累、壓力、罪惡感、自責、矛盾、低落，且沒特別講「剛吃了什麼」——emotional_support。
2. 若使用者描述剛剛/今天吃了什麼、上傳食物照片、要記錄飲食——meal_logging。
3. 若使用者提到「聚餐無法拒絕」「壓力大狂吃」「報復性進食」「失控吃了一堆」——emotional_eating（需要後續補償計畫）。
4. 若使用者要求「排餐單」「幫我規劃明天/這三天」「怎麼補回來」——plan_request。
5. 只有在使用者明確要你幫忙找附近店家、推薦去哪吃時——restaurant_search。
6. 其餘寒暄、追問、澄清、「嗨」「為什麼這麼說」「原來如此」——general_chat。
7. 只提到食物不等於要找餐廳。「我今天吃了炸雞好罪惡」是 emotional_eating（有情緒 + 有飲食），不是 restaurant_search。
8. 「我沒有要叫你找餐廳」不是 restaurant_search。

請只輸出 JSON：
{"intent":"<上述六個之一>","reason":"簡短中文原因，不超過30字"}

對話上下文：
${params.historyText || "（無）"}

使用者最新訊息：
${params.message}
`.trim();
}
