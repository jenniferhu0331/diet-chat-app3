import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } from "@/lib/gemini";
import { SYSTEM_PROMPT } from "@/lib/prompts";

type HistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

type IntentResult = {
  intent: "emotional_support" | "general_chat" | "restaurant_search" | "food_recommendation" | "drink_recommendation";
  reason: string;
};

async function generateText(model: string, prompt: string) {
  const result = await gemini.models.generateContent({ model, contents: prompt });
  return result.text ?? "";
}

async function generateTextWithFallback(prompt: string) {
  try {
    return await generateText(GEMINI_MODEL, prompt);
  } catch (error: any) {
    const msg = String(error?.message || "");
    const retryable = msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
    if (!retryable) throw error;
    try {
      return await generateText(GEMINI_FALLBACK_MODEL, prompt);
    } catch (fallbackError: any) {
      const fallbackMsg = String(fallbackError?.message || "");
      const fallbackRetryable = fallbackMsg.includes("503") || fallbackMsg.includes("UNAVAILABLE") || fallbackMsg.includes("429") || fallbackMsg.includes("RESOURCE_EXHAUSTED");
      if (fallbackRetryable) return null;
      throw fallbackError;
    }
  }
}

function formatHistory(history: HistoryMessage[] = []) {
  return history.slice(-10).map((m) => `${m.role === "user" ? "使用者" : "助理"}：${m.text}`).join("\n");
}

function splitParts(text: string) {
  return text.split(/\n+/).map((s) => s.trim()).filter(Boolean).map((s) => ({ text: s }));
}

async function classifyIntent(message: string, history: HistoryMessage[] = []): Promise<IntentResult> {
  const historyText = formatHistory(history);
  const prompt = `
你是一個對話意圖分類器。根據使用者最新訊息與對話上下文，判斷主要意圖。

分類只能是以下其中一個：
- emotional_support
- general_chat
- restaurant_search
- food_recommendation
- drink_recommendation

判斷原則：
1. 表達疲累、壓力、罪惡感、自責、低落 → emotional_support
2. 寒暄、追問、澄清、延續聊天 → general_chat
3. 明確要找附近店家、搜尋餐廳、查還有開的店 → restaurant_search
4. 問「我可以吃什麼」「推薦我吃什麼」「今天吃什麼好」「想吃健康的」→ food_recommendation
5. 問「可以喝什麼」「推薦飲料」「附近飲料店」「想喝什麼」→ drink_recommendation
6. 只提到食物不代表要找餐廳

請只輸出 JSON：
{"intent":"...","reason":"簡短中文原因，不超過30字"}

對話上下文：
${historyText || "（無）"}

使用者最新訊息：
${message}
`;
  const text = await generateTextWithFallback(prompt);
  if (text === null) return { intent: "general_chat", reason: "模型忙碌" };
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const validIntents = ["emotional_support", "general_chat", "restaurant_search", "food_recommendation", "drink_recommendation"];
    if (validIntents.includes(parsed.intent)) return { intent: parsed.intent, reason: parsed.reason || "已完成分類" };
  } catch {}
  return { intent: "general_chat", reason: "分類失敗" };
}

export async function POST(req: NextRequest) {
  try {
    const { message, lat, lng, history = [] } = await req.json();
    const historyText = formatHistory(history);
    const intentResult = await classifyIntent(message, history);
    const intent = intentResult.intent;

    // ===== food_recommendation =====
    if (intent === "food_recommendation") {
      const prompt = `
使用者問：「${message}」
請根據對話上下文和一般健康飲食原則，推薦 4~6 個具體的餐點選項。
輸出只能是 JSON，格式如下，不要其他文字：
{
  "intro": "一句自然開場",
  "items": [
    {
      "name": "餐點名稱（要具體，例如：雞胸肉便當、燕麥粥加水煮蛋）",
      "description": "一句說明為什麼推薦",
      "calories": 估算卡路里,
      "protein": 估算蛋白質g,
      "fat": 估算脂肪g,
      "carbs": 估算碳水g,
      "price": 估算台幣價格
    }
  ]
}
對話紀錄：${historyText || "（無）"}
`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) return NextResponse.json({ parts: [{ text: "我現在有點忙，稍後再試試看。" }] });
      try {
        const cleaned = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ foodRecommendation: parsed, meta: { intent, reason: intentResult.reason } });
      } catch {
        return NextResponse.json({ parts: splitParts(text), meta: { intent, reason: intentResult.reason } });
      }
    }

    // ===== drink_recommendation =====
    if (intent === "drink_recommendation") {
      let places: any[] = [];
      if (lat && lng) {
        const res = await fetch(`${req.nextUrl.origin}/api/restaurants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "飲料店 手搖飲", lat, lng }),
        });
        const data = await res.json();
        places = (data.places ?? []).filter((p: any) =>
          (p.types ?? []).some((t: string) => ["cafe", "bakery", "food", "store"].includes(t)) ||
          ["茶", "咖啡", "飲料", "果汁", "珍珠", "鮮茶", "清心", "50嵐", "貢茶", "迷客夏", "大苑子", "星巴克"].some((kw) => p.name?.includes(kw))
        );
      }

      const placesSummary = places.slice(0, 4).map((p: any, i: number) =>
        `${i + 1}. ${p.name}｜${p.address ?? ""}｜評分：${p.rating ?? "N/A"}｜${p.openNow ? "營業中" : "未確認"}｜連結：${p.googleMapsLink}`
      ).join("\n");

      const prompt = `
使用者問：「${message}」
${placesSummary ? `附近飲料店：\n${placesSummary}` : "沒有找到附近飲料店資料。"}

請輸出 JSON，格式如下，不要其他文字：
{
  "intro": "一句自然開場",
  "shops": [
    {
      "name": "店名",
      "mapsUrl": "Google Maps 連結（從上方資料取得）",
      "isOpen": true或false,
      "walkingMinutes": 步行分鐘數,
      "items": [
        {
          "name": "飲料品項名稱（要是該店真實有賣的品項）",
          "size": "M或L",
          "sugar": "推薦甜度",
          "ice": "推薦冰量",
          "calories": 估算卡路里,
          "price": 台幣價格
        }
      ]
    }
  ],
  "healthy_tip": "一句選飲料的健康小提示"
}
如果沒有附近店家資料，shops 給空陣列，改推薦 2~3 個通用健康飲料選擇。
對話紀錄：${historyText || "（無）"}
`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) return NextResponse.json({ parts: [{ text: "我現在有點忙，稍後再試試看。" }] });
      try {
        const cleaned = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ drinkRecommendation: parsed, meta: { intent, reason: intentResult.reason } });
      } catch {
        return NextResponse.json({ parts: splitParts(text), meta: { intent, reason: intentResult.reason } });
      }
    }

    // ===== restaurant_search =====
    if (intent === "restaurant_search") {
      let places: any[] = [];
      if (lat && lng) {
        const restaurantRes = await fetch(`${req.nextUrl.origin}/api/restaurants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: message, lat, lng }),
        });
        const restaurantData = await restaurantRes.json();
        places = restaurantData.places ?? [];
      }

      if (!places.length) {
        const prompt = `
${SYSTEM_PROMPT}
對話紀錄：${historyText || "（無）"}
使用者最新訊息：${message}
情境：使用者想找餐廳，但目前沒有順利查到附近店家資料。
請用繁體中文，回覆兩小段：1. 先自然回應 2. 溫和說明沒找到，建議換關鍵字或稍後再試。不要太長。
`;
        const text = await generateTextWithFallback(prompt);
        if (text === null) return NextResponse.json({ parts: [{ text: "我有幫你找找看。" }, { text: "但這次沒有順利抓到附近店家，你可以換個更明確的餐點名稱再試一次。" }], meta: { intent, reason: intentResult.reason } });
        return NextResponse.json({ parts: splitParts(text), meta: { intent, reason: intentResult.reason } });
      }

      const restaurantSummary = places.slice(0, 5).map((p: any, i: number) =>
        `${i + 1}. 店名：${p.name}｜地址：${p.address ?? ""}｜評分：${p.rating ?? "N/A"}｜${p.openNow ? "營業中" : "營業狀態未確認"}｜類型：${p.types?.join(",") ?? ""}｜Google Maps：${p.googleMapsLink}`
      ).join("\n");

      const prompt = `
${SYSTEM_PROMPT}
對話紀錄：${historyText || "（無）"}
使用者最新訊息：${message}
找到的店家（包含便利商店）：
${restaurantSummary}

請輸出 JSON，不要其他文字：
{
  "intro": "一句自然的開場白",
  "budget_tip": "想省錢可以考慮哪間（一句話）",
  "special_tip": "想吃特別的可以去哪間（一句話）",
  "restaurants": [
    {
      "name": "店名",
      "mapsUrl": "Google Maps 連結",
      "rating": 評分數字,
      "isOpen": true或false,
      "walkingMinutes": 步行分鐘數字,
      "recommendations": [
        {
          "item": "推薦餐點名稱",
          "calories": 卡路里數字,
          "protein": 蛋白質g,
          "fat": 脂肪g,
          "carbs": 碳水g,
          "price": 台幣價格數字
        }
      ]
    }
  ]
}
規則：
- 只保留真正可以用餐的地方：餐廳、小吃店、便利商店、早餐店、麵包店、咖啡廳
- 排除藥局、飲料手搖店（非用餐）、保健品店、藥妝店、超市、百貨、服飾、電器、診所
- 如果店名明顯是飲料品牌或非食物店直接跳過
- 每間店給 1~2 個推薦餐點
- 便利商店給真實商品名稱和準確營養數據
- walkingMinutes 每 500 公尺約 4 分鐘，無法判斷給 5
- 只輸出 JSON
`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) return NextResponse.json({ parts: [{ text: "我幫你找到幾個附近的選項，但這次沒辦法詳細整理，你可以稍後再試。" }], meta: { intent, reason: intentResult.reason } });
      try {
        const cleaned = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({ restaurantCards: parsed, meta: { intent, reason: intentResult.reason } });
      } catch {
        return NextResponse.json({ parts: splitParts(text), meta: { intent, reason: intentResult.reason } });
      }
    }

    // ===== emotional_support / general_chat =====
    const prompt = `
${SYSTEM_PROMPT}
你是一個以情緒支持為主的聊天助理。
對話紀錄：${historyText || "（無）"}
使用者最新訊息：${message}
模型判定意圖：${intent}，原因：${intentResult.reason}

請用繁體中文自然回覆：
1. emotional_support：先同理，接住情緒，不要急著給解法
2. general_chat：自然延續上下文
3. 回覆 1~2 小段，不要太長，不要像客服
`;
    const text = await generateTextWithFallback(prompt);
    if (text === null) return NextResponse.json({ parts: [{ text: "我在。" }, { text: "你可以慢慢說。" }], meta: { intent, reason: intentResult.reason } });
    return NextResponse.json({ parts: splitParts(text), meta: { intent, reason: intentResult.reason } });

  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "Chat error" }, { status: 500 });
  }
}
