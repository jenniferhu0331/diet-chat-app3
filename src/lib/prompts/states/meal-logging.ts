export function buildMealLoggingPrompt(params: {
  historyText: string;
  message: string;
}) {
  return `
使用者正在描述/記錄剛吃或今天吃的食物。

對話紀錄：
${params.historyText || "（無）"}

使用者最新訊息：
${params.message}

請用繁體中文：
1. 先自然接話（例如「聽起來不錯」「那家不錯誒」），展現你有在聽
2. 簡短回饋一下營養面——但不要像營養師報告，用朋友的方式說（例如「蛋白質還蠻夠的」）
3. 不要批評食物選擇；不要說「下次可以改吃什麼」除非他問
4. 結尾可以輕鬆問他心情/配菜/感受，不是檢查問題
5. 回覆 1~2 小段，不要長
`.trim();
}
