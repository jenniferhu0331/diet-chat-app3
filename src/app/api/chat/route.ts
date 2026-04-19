import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } from "@/lib/gemini";
import { SYSTEM_PROMPT } from "@/lib/prompts";

type HistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

type IntentResult = {
  intent: "emotional_support" | "general_chat" | "restaurant_search";
  reason: string;
};

async function generateText(model: string, prompt: string) {
  const result = await gemini.models.generateContent({
    model,
    contents: prompt,
  });
  return result.text ?? "";
}

async function generateTextWithFallback(prompt: string) {
  try {
    return await generateText(GEMINI_MODEL, prompt);
  } catch (error: any) {
    const msg = String(error?.message || "");
    const retryable =
      msg.includes("503") || msg.includes("UNAVAILABLE") ||
      msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED");
    if (!retryable) throw error;
    try {
      return await generateText(GEMINI_FALLBACK_MODEL, prompt);
    } catch (fallbackError: any) {
      const fallbackMsg = String(fallbackError?.message || "");
      const fallbackRetryable =
        fallbackMsg.includes("503") || fallbackMsg.includes("UNAVAILABLE") ||
        fallbackMsg.includes("429") || fallbackMsg.includes("RESOURCE_EXHAUSTED");
      if (fallbackRetryable) return null;
      throw fallbackError;
    }
  }
}

function formatHistory(history: HistoryMessage[] = []) {
  return history
    .slice(-10)
    .map((m) => `${m.role === "user" ? "使用者" : "助理"}：${m.text}`)
    .join("\n");
}

function splitParts(text: string) {
  return text.split(/\n+/).map((s) => s.trim()).filter(Boolean).map((s) => ({ text: s }));
}

async function classifyIntent(message: string, history: HistoryMessage[] = []): Promise<IntentResult> {
  const historyText = formatHistory(history);
  const prompt = `
你是一個對話意圖分類器。
請根據使用者最新訊息與對話上下文，判斷這句話的主要意圖。

分類只能是以下其中一個：
- emotional_support
- general_chat
- restaurant_search

判斷原則：
1. 如果使用者在表達疲累、壓力、罪惡感、自責、矛盾、低落、需要被理解，優先判定為 emotional_support。
2. 如果只是寒暄、追問、澄清、延續聊天，例如「嗨」「為什麼這麼說」「原來如此」，判定為 general_chat。
3. 只有在使用者明確表示要你幫忙找附近店家、推薦吃什麼、搜尋餐廳、查看還有開的選擇時，才判定為 restaurant_search。
4. 只提到食物，不代表要找餐廳。
5. 像「我今天吃了炸雞好罪惡」應該是 emotional_support，不是 restaurant_search。
6. 像「我沒有要叫你找餐廳」應該不是 restaurant_search。

請只輸出 JSON，格式如下：
{"intent":"emotional_support | general_chat | restaurant_search","reason":"簡短中文原因，不超過30字"}

對話上下文：
${historyText || "（無）"}

使用者最新訊息：
${message}
`;
  const text = await generateTextWithFallback(prompt);
  if (text === null) return { intent: "general_chat", reason: "模型忙碌，先當一般聊天" };
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.intent === "emotional_support" || parsed.intent === "general_chat" || parsed.intent === "restaurant_search") {
      return { intent: parsed.intent, reason: parsed.reason || "已完成分類" };
    }
  } catch {}
  return { intent: "general_chat", reason: "分類失敗，先當一般聊天" };
}

export async function POST(req: NextRequest) {
  try {
    const { message, lat, lng, history = [] } = await req.json();
    const historyText = formatHistory(history);
    const intentResult = await classifyIntent(message, history);
    const intent = intentResult.intent;

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
        if (text === null) {
          return NextResponse.json({ parts: [{ text: "我有幫你找找看。" }, { text: "但這次沒有順利抓到附近店家，你可以換個更明確的餐點名稱再試一次。" }], meta: { intent, reason: intentResult.reason } });
        }
        return NextResponse.json({ parts: splitParts(text), meta: { intent, reason: intentResult.reason } });
      }

      const restaurantSummary = places.slice(0, 5).map((p: any, i: number) =>
        `${i + 1}. 店名：${p.name}｜地址：${p.address ?? ""}｜評分：${p.rating ?? "N/A"}｜${p.openNow ? "營業中" : "營業狀態未確認"}｜類型：${p.types?.join(",") ?? ""}｜Google Maps：${p.googleMapsLink}`
      ).join("\n");

      const prompt = `
${SYSTEM_PROMPT}

你是一個以情緒支持為主，但具備找餐廳能力的聊天助理。

對話紀錄：
${historyText || "（無）"}

使用者最新訊息：
${message}

找到的店家（包含便利商店）：
${restaurantSummary}

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
- 每間店給 1~2 個推薦餐點
- 便利商店（7-11、全家、萊爾富、OK）要給真實商品名稱和盡量準確的營養數據
- walkingMinutes 根據地址估算，每 500 公尺約 4 分鐘，如果無法判斷就給 5
- 營養數字請合理估算，便利商店商品盡量準確
- 價格單位是台幣，便利商店商品給真實售價
- 只輸出 JSON，不要任何說明文字
`;

      const text = await generateTextWithFallback(prompt);

      if (text === null) {
        return NextResponse.json({
          parts: [{ text: "我幫你找到幾個附近的選項，但這次沒辦法詳細整理，你可以稍後再試。" }],
          meta: { intent, reason: intentResult.reason },
        });
      }

      // 嘗試解析 JSON，成功就回傳 restaurantCards 格式
      try {
        const cleaned = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        return NextResponse.json({
          restaurantCards: parsed,
          meta: { intent, reason: intentResult.reason },
        });
      } catch {
        // JSON 解析失敗就回傳純文字
        return NextResponse.json({
          parts: splitParts(text),
          meta: { intent, reason: intentResult.reason },
        });
      }
    }

    // 情緒支持 / 一般聊天
    const prompt = `
${SYSTEM_PROMPT}
你是一個以情緒支持為主的聊天助理。
找餐廳只是附加功能，除非使用者明確要求，否則不要主動進入找餐廳模式。

對話紀錄：
${historyText || "（無）"}

使用者最新訊息：
${message}

模型判定這句主要意圖是：${intent}
原因：${intentResult.reason}

請用繁體中文自然回覆：
1. 如果是 emotional_support，先同理，再接住情緒，不要急著給解法
2. 如果是 general_chat，就自然延續上下文，不要重複前一句
3. 如果使用者提到食物，但沒有要求找餐廳，不要幫他找店
4. 回覆分成 1~2 小段，不要太長
5. 避免太像客服或制式心理諮商口吻
`;

    const text = await generateTextWithFallback(prompt);
    if (text === null) {
      return NextResponse.json({
        parts: [{ text: "我在。" }, { text: "你可以慢慢說，我有在看你剛剛講的內容。" }],
        meta: { intent, reason: intentResult.reason },
      });
    }
    return NextResponse.json({ parts: splitParts(text), meta: { intent, reason: intentResult.reason } });

  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "Chat error" }, { status: 500 });
  }
}