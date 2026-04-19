export function buildPlanRequestPrompt(params: {
  historyText: string;
  message: string;
  compensationPlanJson?: string;
}) {
  const planBlock = params.compensationPlanJson
    ? `\n以下是已經生成好的三天餐單 JSON（前端會渲染成卡片），你只需要用輕鬆口吻告訴使用者「已經幫你排好了，可以看下面」，不要把 JSON 貼出來：\n${params.compensationPlanJson}\n`
    : "";

  return `
使用者要求你幫他規劃接下來幾天的餐單。

對話紀錄：
${params.historyText || "（無）"}

使用者最新訊息：
${params.message}

請用繁體中文：
1. 簡短說明你已經幫他準備好
2. 告訴他可以看下方的餐單卡片
3. 提一下你安排的邏輯（例如「把蛋白質拉高、油脂清淡一點」），但只要 1~2 句
4. 結尾鼓勵他，可以調整、不用百分之百照做
5. 不要把 JSON 原文貼給使用者
${planBlock}
`.trim();
}
