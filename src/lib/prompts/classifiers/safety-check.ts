/**
 * 輸出端的安全分類器。
 * 在回覆傳給使用者之前跑一次，若不安全就由 reviseReply 改寫。
 */

export type SafetyRisk =
  | "low_calorie"          // 建議 < 1200 kcal
  | "eating_disorder"      // 催吐、代償、極端禁食
  | "shaming_language"     // 罪惡、失控、發胖等字眼
  | "body_judgement"       // 評論身材/體重
  | "medical_advice";      // 給特殊族群具體醫療建議

export type SafetyResult = {
  safe: boolean;
  risks: SafetyRisk[];
  reason: string;
};

export function buildSafetyCheckPrompt(reply: string) {
  return `
檢查下列回覆是否觸犯風險。風險類型：
- low_calorie: 建議每日 < 1200 kcal 的飲食或極端節食
- eating_disorder: 建議催吐、代償運動、禁食超過 16 小時、或其他飲食失調行為
- shaming_language: 使用「罪惡」「失控」「發胖」等負面標籤
- body_judgement: 對身材或體重下評價
- medical_advice: 對糖尿病、孕期、進食障礙病史等族群給具體醫療或劑量建議

回覆內容：
"""
${reply}
"""

只輸出 JSON，格式：
{"safe": true|false, "risks": ["風險代號1", ...], "reason": "一句說明"}
若安全，risks 為空陣列。
`.trim();
}

export function buildReviseReplyPrompt(params: {
  original: string;
  risks: SafetyRisk[];
  historyText: string;
}) {
  return `
以下回覆被判定有風險：${params.risks.join(", ") || "（未指明）"}

原始回覆：
"""
${params.original}
"""

對話歷史：
${params.historyText || "（無）"}

請改寫為符合「小食」人格（親近、不說教）的版本，保留原意的溫暖但移除所有風險內容。
若原意本身就危險（例如使用者要求極端節食方案），改為溫和拒絕並建議諮詢營養師或醫師。
只輸出改寫後的純文字，不要任何說明或 JSON。
`.trim();
}
