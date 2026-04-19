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
      msg.includes("503") ||
      msg.includes("UNAVAILABLE") ||
      msg.includes("429") ||
      msg.includes("RESOURCE_EXHAUSTED");

    if (!retryable) {
      throw error;
    }

    try {
      return await generateText(GEMINI_FALLBACK_MODEL, prompt);
    } catch (fallbackError: any) {
      const fallbackMsg = String(fallbackError?.message || "");
      const fallbackRetryable =
        fallbackMsg.includes("503") ||
        fallbackMsg.includes("UNAVAILABLE") ||
        fallbackMsg.includes("429") ||
        fallbackMsg.includes("RESOURCE_EXHAUSTED");

      if (fallbackRetryable) {
        return null;
      }

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
  return text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({ text: s }));
}

async function classifyIntent(
  message: string,
  history: HistoryMessage[] = []
): Promise<IntentResult> {
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
{
  "intent": "emotional_support | general_chat | restaurant_search",
  "reason": "簡短中文原因，不超過30字"
}

對話上下文：
${historyText || "（無）"}

使用者最新訊息：
${message}
`;

  const text = await generateTextWithFallback(prompt);

  if (text === null) {
    return {
      intent: "general_chat",
      reason: "模型忙碌，先當一般聊天",
    };
  }

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    if (
      parsed.intent === "emotional_support" ||
      parsed.intent === "general_chat" ||
      parsed.intent === "restaurant_search"
    ) {
      return {
        intent: parsed.intent,
        reason: parsed.reason || "已完成分類",
      };
    }
  } catch {
    // ignore
  }

  return {
    intent: "general_chat",
    reason: "分類失敗，先當一般聊天",
  };
}

export async function POST(req: NextRequest) {
  try {
    const { message, lat, lng, history = [] } = await req.json();
    const historyText = formatHistory(history);

    // 1) 所有訊息先交給 Gemini 判斷意圖
    const intentResult = await classifyIntent(message, history);
    const intent = intentResult.intent;

    // 2) 如果模型判定是找餐廳，才真的呼叫工具
    if (intent === "restaurant_search") {
      let places: any[] = [];

      if (lat && lng) {
        const restaurantRes = await fetch(`${req.nextUrl.origin}/api/restaurants`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: message,
            lat,
            lng,
          }),
        });

        const restaurantData = await restaurantRes.json();
        places = restaurantData.places ?? [];
      }

      if (!places.length) {
        const prompt = `
${SYSTEM_PROMPT}

你是一個以情緒支持為主，但具備找餐廳能力的聊天助理。
只有在使用者明確要求時，才進入找餐廳模式。

對話紀錄：
${historyText || "（無）"}

使用者最新訊息：
${message}

情境：
使用者想找餐廳，但目前沒有順利查到附近店家資料。

請用繁體中文，回覆兩小段：
1. 先自然回應，不要太像客服
2. 再溫和說明這次沒有順利找到，建議他換更明確的餐點關鍵字或稍後再試
請不要太長。
`;

        const text = await generateTextWithFallback(prompt);

        if (text === null) {
          return NextResponse.json({
            parts: [
              { text: "我有幫你找找看。" },
              { text: "但這次沒有順利抓到附近店家，你可以換個更明確的餐點名稱再試一次。" },
            ],
            meta: {
              intent,
              reason: intentResult.reason,
            },
          });
        }

        return NextResponse.json({
          parts: splitParts(text),
          meta: {
            intent,
            reason: intentResult.reason,
          },
        });
      }

      const restaurantSummary = places
        .slice(0, 4)
        .map(
          (p: any, i: number) =>
            `${i + 1}. ${p.name}｜${p.address ?? ""}｜評分 ${p.rating ?? "N/A"}｜${
              p.openNow ? "營業中" : "營業狀態未確認"
            }｜${p.healthTag ?? ""}｜連結：${p.googleMapsLink}`
        )
        .join("\n");

      const prompt = `
${SYSTEM_PROMPT}

你是一個以情緒支持為主，但具備找餐廳能力的聊天助理。
請記得：餐廳推薦只是附加功能，語氣仍然要像在陪伴使用者。

對話紀錄：
${historyText || "（無）"}

使用者最新訊息：
${message}

模型判定這次需要餐廳搜尋。
找到的店家如下：
${restaurantSummary}

請用繁體中文回覆，規則：
1. 先一句自然短回覆
2. 再一句簡短推薦
3. 列出 2~4 間店，每間格式如下：

**店名**
🚶 步行約 X 分鐘（根據地址與使用者位置估算，每500公尺約4分鐘）
⭐ 評分｜營業狀態
🥗 健康推薦點法：列出 1~2 種這間店適合的健康餐點組合（例如：烤雞腿+沙拉、豆漿+蛋餅）
🔥 估計熱量：XXX kcal｜蛋白質 XXg｜脂肪 XXg｜碳水 XXg
💰 估計價位：XX~XX 元
<a href="對應連結" target="_blank" rel="noopener noreferrer">在 Google Maps 開啟</a>

4. 營養數字請根據餐廳類型與台灣飲食習慣合理估算
5. 價位請根據台灣一般行情估算
6. 步行時間請根據店家地址與使用者大概位置估算，若無法判斷就寫「步行約 5~10 分鐘」
7. 語氣自然，不要像報表
`;

      const text = await generateTextWithFallback(prompt);

      if (text === null) {
        const cardsText = places
          .slice(0, 4)
          .map(
            (p: any, i: number) =>
              `${i + 1}. ${p.name}
${p.openNow ? "🟢 營業中" : "⚪ 營業狀態未確認"}｜⭐ ${p.rating ?? "N/A"}｜${p.healthTag ?? ""}
<a href="${p.googleMapsLink}" target="_blank" rel="noopener noreferrer">在 Google Maps 開啟</a>`
          )
          .join("\n\n");

        return NextResponse.json({
          parts: [
            { text: "我幫你找到幾個附近的選項。" },
            { text: "你可以先看看這幾間，再告訴我你比較想吃哪一種。" },
            { text: cardsText },
          ],
          meta: {
            intent,
            reason: intentResult.reason,
          },
        });
      }

      return NextResponse.json({
        parts: splitParts(text),
        meta: {
          intent,
          reason: intentResult.reason,
        },
      });
    }

    // 3) 情緒支持 / 一般聊天都走主聊天流程
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
        parts: [
          { text: "我在。" },
          { text: "你可以慢慢說，我有在看你剛剛講的內容。" },
        ],
        meta: {
          intent,
          reason: intentResult.reason,
        },
      });
    }

    return NextResponse.json({
      parts: splitParts(text),
      meta: {
        intent,
        reason: intentResult.reason,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Chat error" },
      { status: 500 }
    );
  }
}