export function buildEmotionalEatingPrompt(params: {
  historyText: string;
  message: string;
  intentReason: string;
  compensationPlanJson?: string;
}) {
  const planBlock = params.compensationPlanJson
    ? `\n以下是即將跟使用者分享的三天補償計畫（JSON），請在回覆中用輕鬆語氣提到「已經幫你排好接下來三天的餐單」，但不要把 JSON 原文貼給使用者：\n${params.compensationPlanJson}\n`
    : "";

  return `
使用者目前處於情緒性進食或聚餐無法拒絕的情境。

對話紀錄：
${params.historyText || "（無）"}

使用者最新訊息：
${params.message}

意圖分類原因：${params.intentReason}

請用繁體中文：
1. 第一步：情緒支持（2-3 句）
   - 先認可「這種情況本來就很難」
   - 鼓勵他享受當下、肯定美食帶來的快樂
   - 不要用「沒關係但是...」這種假同理
   - 絕對不要說「你失敗了」「你失控了」「明天要補回來」
2. 第二步：輕鬆提及已安排好後三天餐單
   - 用「我幫你排好接下來三天的餐單，讓你不用自己煩惱」這種口吻
   - 不要貼 JSON、不要列密密麻麻的熱量數字
3. 結尾可以再給一個溫暖收尾
4. 回覆 2~3 小段即可
${planBlock}
`.trim();
}
