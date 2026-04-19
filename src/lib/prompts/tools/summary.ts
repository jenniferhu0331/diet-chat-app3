/**
 * 每日對話摘要 prompt。
 * 由 /api/chat/summarize 在 session 結束或每日固定時間觸發。
 */

export type DailySummary = {
  date: string; // YYYY-MM-DD
  meals: Array<{
    time?: string;
    description: string;
    estimated_kcal?: number;
  }>;
  mood_signals: Array<"stressed" | "happy" | "neutral" | "social_eating" | "self_critical">;
  interventions: string[];
  open_threads: string[];
};

export function buildSummaryPrompt(params: {
  date: string;
  conversationText: string;
}) {
  return `
把以下今天的對話壓縮成 JSON，供明天參考。

日期：${params.date}

對話內容：
"""
${params.conversationText}
"""

請只輸出 JSON：
{
  "date": "${params.date}",
  "meals": [
    { "time": "HH:mm 或 morning/noon/evening", "description": "吃了什麼", "estimated_kcal": 數字或 null }
  ],
  "mood_signals": ["stressed" | "happy" | "neutral" | "social_eating" | "self_critical"],
  "interventions": ["我們給了什麼建議或計畫"],
  "open_threads": ["明天要追蹤的事，例如：明天是聚餐後第一天，要提醒清淡"]
}

若某個欄位沒有內容，給空陣列。不要編造對話裡沒出現的事。
`.trim();
}

export function formatSummaryAsContext(summary: DailySummary | null): string {
  if (!summary) return "";
  const meals = summary.meals.length
    ? summary.meals.map(m => `  - ${m.time || ""} ${m.description}${m.estimated_kcal ? ` (~${m.estimated_kcal} kcal)` : ""}`).join("\n")
    : "  - （無）";
  const moods = summary.mood_signals.length ? summary.mood_signals.join(", ") : "（無）";
  const threads = summary.open_threads.length
    ? summary.open_threads.map(t => `  - ${t}`).join("\n")
    : "  - （無）";
  return `
【昨日摘要 ${summary.date}】
飲食：
${meals}
情緒訊號：${moods}
待追蹤：
${threads}
`.trim();
}
