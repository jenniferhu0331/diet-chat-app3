export function buildRestaurantNoResultsPrompt(params: {
  historyText: string;
  message: string;
}) {
  return `
對話紀錄：${params.historyText || "（無）"}
使用者最新訊息：${params.message}
情境：使用者想找餐廳，但目前沒有順利查到附近店家資料。

請用繁體中文，回覆兩小段：
1. 先自然回應
2. 溫和說明沒找到，建議換關鍵字或稍後再試
不要太長。
`.trim();
}

export function buildRestaurantCardsPrompt(params: {
  historyText: string;
  message: string;
  restaurantSummary: string;
}) {
  return `
你是一個以情緒支持為主，但具備找餐廳能力的聊天助理。

對話紀錄：
${params.historyText || "（無）"}

使用者最新訊息：
${params.message}

找到的店家（包含便利商店）：
${params.restaurantSummary}

請輸出一個 JSON 物件，格式如下，不要有任何其他文字或 markdown：
{
  "intro": "一句自然的開場白",
  "budget_tip": "想省錢可以考慮哪間或哪個選擇（一句話）",
  "special_tip": "想吃特別的可以去哪間（一句話）",
  "restaurants": [
    {
      "name": "店名",
      "mapsUrl": "Google Maps 連結",
      "rating": 4.2,
      "isOpen": true,
      "walkingMinutes": 估算步行分鐘數(數字),
      "recommendations": [
        {
          "item": "推薦餐點名稱（要具體，便利商店要給真實商品名）",
          "calories": 估算卡路里數字,
          "protein": 估算蛋白質公克數字,
          "fat": 估算脂肪公克數字,
          "carbs": 估算碳水公克數字,
          "price": 估算價格數字
        }
      ]
    }
  ]
}

規則：
- 只保留真正可以用餐的地方：餐廳、小吃店、便利商店、早餐店、麵包店、咖啡廳
- 排除以下類型：藥局、飲料手搖店（非用餐）、保健品店、藥妝店、超市、百貨、服飾、電器、診所
- 如果店名明顯是飲料品牌（龍角散、維他露、寶礦力等）或非食物店，直接跳過不要列入
- 每間店給 1~2 個推薦餐點
- 便利商店（7-11、全家、萊爾富、OK）要給真實商品名稱和盡量準確的營養數據
- walkingMinutes 根據地址估算，每 500 公尺約 4 分鐘，如果無法判斷就給 5
- 營養數字請合理估算，便利商店商品盡量準確
- 價格單位是台幣，便利商店商品給真實售價
- 只輸出 JSON，不要任何說明文字
`.trim();
}
