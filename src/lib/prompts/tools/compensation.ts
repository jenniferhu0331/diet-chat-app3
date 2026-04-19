/**
 * 三天補償餐單生成 prompt。
 * 給 emotional_eating / plan_request 兩個 state 使用。
 * 輸出結構化 JSON，前端渲染成卡片。
 */

export type CompensationMeal = {
  name: string;
  kcal: number;
  notes?: string;
};

export type CompensationDay = {
  day: number;           // 1, 2, 3
  label?: string;        // 例如 "明天 (4/20)"
  breakfast: CompensationMeal;
  lunch: CompensationMeal;
  dinner: CompensationMeal;
  snack?: CompensationMeal;
  total_kcal: number;
};

export type CompensationPlan = {
  reasoning: string;     // 一句話解釋安排邏輯
  days: CompensationDay[];
};

export function buildCompensationPlanPrompt(params: {
  historyText: string;
  message: string;
  todayContext?: string;  // 今天已估計的熱量/營養摘要（可選）
  startDateLabel?: string; // 例如 "4/20"
}) {
  return `
你是一個擅長飲食規劃的營養夥伴。
根據使用者今天的狀況，為他排好「接下來三天」的餐單。

對話紀錄：
${params.historyText || "（無）"}

使用者最新訊息：
${params.message}

今天的飲食狀況：
${params.todayContext || "（未知，請用合理預估）"}

起始日期標籤：${params.startDateLabel || "明天"}

請輸出一個 JSON 物件，不要任何其他文字或 markdown：
{
  "reasoning": "一句話解釋為什麼這樣安排（例如：今天蛋白質夠但澱粉多了，明後天把主食換成糙米並補蔬菜）",
  "days": [
    {
      "day": 1,
      "label": "明天 (MM/DD)",
      "breakfast": { "name": "具體餐點名稱", "kcal": 數字, "notes": "一句話說明" },
      "lunch":     { "name": "...", "kcal": 數字, "notes": "..." },
      "dinner":    { "name": "...", "kcal": 數字, "notes": "..." },
      "snack":     { "name": "...（可選）", "kcal": 數字, "notes": "..." },
      "total_kcal": 數字
    },
    { "day": 2, ... },
    { "day": 3, ... }
  ]
}

硬性規則：
- 每日總熱量必須在 1400-1800 kcal 之間
- 份量符合台灣常見餐點大小，不要給只有蔬菜汁或過小份量的菜單
- 餐點要真的能在台灣便利商店 / 常見餐廳 / 自煮取得
- 用「我們一起慢慢調回來」的中性口吻放在 reasoning，不用罪惡、失控、補回來等詞
- 絕對不輸出 JSON 以外的內容
`.trim();
}
