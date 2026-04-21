import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } from "@/lib/gemini";
import { SYSTEM_PROMPT } from "@/lib/prompts";

type HistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

type IntentResult = {
  intent: "emotional_support" | "general_chat" | "restaurant_search" | "food_recommendation" | "drink_recommendation" | "gratitude_chat";
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
      if (fallbackMsg.includes("503") || fallbackMsg.includes("UNAVAILABLE") || fallbackMsg.includes("429") || fallbackMsg.includes("RESOURCE_EXHAUSTED")) return null;
      throw fallbackError;
    }
  }
}

async function generateTextStream(prompt: string): Promise<ReadableStream<Uint8Array>> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        const result = await gemini.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: prompt,
        });
        for await (const chunk of result) {
          const text = chunk.text ?? "";
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch {
        const text = await generateTextWithFallback(prompt) ?? "我在。你可以慢慢說。";
        controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });
}

function formatHistory(history: HistoryMessage[] = []) {
  return history.slice(-10).map((m) => `${m.role === "user" ? "使用者" : "助理"}：${m.text}`).join("\n");
}

function splitParts(text: string) {
  return text.split(/\n+/).map((s) => s.trim()).filter(Boolean).map((s) => ({ text: s }));
}

async function classifyIntent(message: string, history: HistoryMessage[] = [], isGratitudeMode = false): Promise<IntentResult> {
  if (isGratitudeMode) return { intent: "gratitude_chat", reason: "感恩日記模式" };

  const historyText = formatHistory(history);
  const prompt = `
你是一個對話意圖分類器。根據使用者最新訊息與對話上下文，判斷主要意圖。

分類只能是以下其中一個：
- emotional_support
- general_chat
- restaurant_search
- food_recommendation
- drink_recommendation
- gratitude_chat

判斷原則：
1. 表達疲累、壓力、罪惡感、自責、低落 → emotional_support
2. 寒暄、追問、澄清、延續聊天 → general_chat
3. 明確要找附近店家、搜尋餐廳 → restaurant_search
4. 問「我可以吃什麼」「推薦我吃什麼」→ food_recommendation
5. 問「可以喝什麼」「推薦飲料」→ drink_recommendation
6. 提到感恩、感謝、今天開心的事、想感謝誰 → gratitude_chat

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
    const validIntents = ["emotional_support", "general_chat", "restaurant_search", "food_recommendation", "drink_recommendation", "gratitude_chat"];
    if (validIntents.includes(parsed.intent)) return { intent: parsed.intent, reason: parsed.reason || "已完成分類" };
  } catch {}
  return { intent: "general_chat", reason: "分類失敗" };
}

const GRATITUDE_PERSONA = `
你是一個活潑、真誠的大學生朋友，用一種mindful的方式傾聽對方。
回應簡短不囉嗦，語氣自然放鬆、像朋友聊天，不要正式。
不要給建議、不要分析、不要評判。
根據對方分享的內容，幫助他們探索情緒、經歷、生活變化、人際關係或感謝的源頭。
自然回應對方說的話，有時候延伸話題，但避免重複對方的用詞。
避免重複的開場白、制式化的表達或通俗祝福語（例如「希望一切順利」）。
不要用過多形容詞或過於客觀的描述，專注在輕鬆的日常對話。
每次回應結尾加一個簡短的開放式問題，幫助使用者反思他們提到的感恩事件，鼓勵繼續分享。
問題要簡單、輕鬆、友善。
使用繁體中文。
`.trim();

export async function POST(req: NextRequest) {
  try {
    const { message, lat, lng, history = [], dietContext = "", isGratitudeMode = false, gratitudeStep = 0 } = await req.json();
    const historyText = formatHistory(history);
    const intentResult = await classifyIntent(message, history, isGratitudeMode);
    const intent = intentResult.intent;

    const dietInfo = dietContext
      ? `使用者今日飲食狀況：${dietContext}`
      : "今日尚無飲食紀錄（可能還沒記錄）";

    // ===== gratitude_chat =====
    if (intent === "gratitude_chat" || isGratitudeMode) {
      let systemPrompt = "";

      if (gratitudeStep === 0 && !message) {
        // AI 主動開口
        systemPrompt = `${GRATITUDE_PERSONA}

現在主動開口詢問使用者今天有什麼想感謝的事。
語氣輕鬆自然，像朋友傍晚聊天一樣，不要太正式。
一句話就好，結尾加一個開放式問題。`;
      } else if (message.includes("記錄") || message.includes("存") || message.includes("好了") || message.includes("就這樣")) {
        // 使用者要儲存
        return NextResponse.json({
          gratitudeSave: true,
          text: "好，幫你記下來了 🌸 今天分享的這些，等你以後翻出來看，應該會覺得很溫暖。",
          meta: { intent: "gratitude_chat" }
        });
      } else {
        // 正常感恩對話
        systemPrompt = `${GRATITUDE_PERSONA}

對話紀錄：
${historyText || "（無）"}

使用者說：「${message}」

請自然回應，並在結尾加一個輕鬆的反問。回應要簡短，2~3句話就好。`;
      }

      const stream = await generateTextStream(systemPrompt || `${GRATITUDE_PERSONA}\n使用者說：「${message}」\n請自然回應，結尾加一個輕鬆的反問。`);
      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Intent": "gratitude_chat",
          "Transfer-Encoding": "chunked",
        },
      });
    }

    // ===== food_recommendation =====
    if (intent === "food_recommendation") {
      const prompt = `
使用者問：「${message}」
${dietInfo}
請根據今日飲食狀況，推薦 4~6 個現在最適合吃的餐點。
- 今天熱量已超過 1800 kcal：優先推薦低卡、高蛋白、蔬菜為主
- 今天熱量在 1200~1800 kcal：推薦均衡的選項
- 今天熱量低於 1200 kcal 或無紀錄：推薦正常份量
在每個 description 裡說明為什麼現在適合這個選擇。
只輸出 JSON，不要其他文字：
{"intro":"一句根據今日飲食狀況的個人化開場","items":[{"name":"餐點名稱","description":"為什麼現在適合","calories":數字,"protein":數字,"fat":數字,"carbs":數字,"price":數字}]}
對話紀錄：${historyText || "（無）"}`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) return NextResponse.json({ parts: [{ text: "我現在有點忙，稍後再試試看。" }] });
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
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
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "飲料店 手搖飲 咖啡", lat, lng }),
        });
        const data = await res.json();
        places = (data.places ?? []).filter((p: any) =>
          ["茶", "咖啡", "飲料", "果汁", "珍珠", "鮮茶", "清心", "50嵐", "貢茶", "迷客夏", "大苑子", "星巴克", "cama", "路易莎"].some((kw) => p.name?.includes(kw)) ||
          (p.types ?? []).includes("cafe")
        );
      }
      const placesSummary = places.slice(0, 4).map((p: any, i: number) =>
        `${i + 1}. ${p.name}｜${p.address ?? ""}｜評分：${p.rating ?? "N/A"}｜${p.openNow ? "營業中" : "未確認"}｜連結：${p.googleMapsLink}`
      ).join("\n");
      const prompt = `
使用者問：「${message}」
${dietInfo}
請根據今日飲食狀況給出個人化飲料建議：
- 今天熱量已超過 1800 kcal → 強烈建議無糖、不加料
- 今天熱量在 1200~1800 kcal → 可以少糖，加料在合理範圍
- 今天熱量低於 1200 kcal 或無紀錄 → 可以正常甜度
${placesSummary ? `附近飲料店：\n${placesSummary}` : "沒有找到附近飲料店資料。"}
只輸出 JSON：
{"intro":"一句開場","shops":[{"name":"店名","mapsUrl":"連結","isOpen":true,"walkingMinutes":5,"items":[{"name":"品項","size":"M","sugar":"無糖","ice":"少冰","calories":100,"price":55}]}],"healthy_tip":"個人化建議"}
如果沒有附近店家，shops 給空陣列。
對話紀錄：${historyText || "（無）"}`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) return NextResponse.json({ parts: [{ text: "我現在有點忙，稍後再試試看。" }] });
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
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
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: message, lat, lng }),
        });
        places = (await restaurantRes.json()).places ?? [];
      }
      if (!places.length) {
        const text = await generateTextWithFallback(`${SYSTEM_PROMPT}\n對話紀錄：${historyText || "（無）"}\n使用者最新訊息：${message}\n情境：使用者想找餐廳，但目前沒有順利查到附近店家資料。\n請用繁體中文，回覆兩小段：1. 先自然回應 2. 溫和說明沒找到。不要太長。`);
        if (text === null) return NextResponse.json({ parts: [{ text: "這次沒有順利抓到附近店家，你可以換個更明確的餐點名稱再試一次。" }] });
        return NextResponse.json({ parts: splitParts(text), meta: { intent, reason: intentResult.reason } });
      }
      const restaurantSummary = places.slice(0, 5).map((p: any, i: number) =>
        `${i + 1}. 店名：${p.name}｜地址：${p.address ?? ""}｜評分：${p.rating ?? "N/A"}｜${p.openNow ? "營業中" : "未確認"}｜類型：${p.types?.join(",") ?? ""}｜Google Maps：${p.googleMapsLink}`
      ).join("\n");
      const prompt = `
${SYSTEM_PROMPT}
對話紀錄：${historyText || "（無）"}
使用者最新訊息：${message}
${dietInfo}
找到的店家：${restaurantSummary}
請根據今日飲食狀況，推薦最適合的餐點。
只輸出 JSON：
{"intro":"一句開場","budget_tip":"省錢建議","special_tip":"特別推薦","restaurants":[{"name":"店名","mapsUrl":"連結","rating":4.2,"isOpen":true,"walkingMinutes":5,"recommendations":[{"item":"餐點","calories":500,"protein":20,"fat":15,"carbs":60,"price":80}]}]}
規則：只保留可用餐的地方，排除藥局、純飲料店、藥妝、診所。便利商店給真實商品名。只輸出 JSON。`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) return NextResponse.json({ parts: [{ text: "找到幾個附近的選項，但這次沒辦法詳細整理，你可以稍後再試。" }] });
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        return NextResponse.json({ restaurantCards: parsed, meta: { intent, reason: intentResult.reason } });
      } catch {
        return NextResponse.json({ parts: splitParts(text), meta: { intent, reason: intentResult.reason } });
      }
    }

    // ===== emotional_support / general_chat — streaming =====
    const streamPrompt = `
${SYSTEM_PROMPT}
你是一個以情緒支持為主的聊天助理。
對話紀錄：${historyText || "（無）"}
使用者最新訊息：${message}
模型判定意圖：${intent}，原因：${intentResult.reason}
${dietInfo}
請用繁體中文自然回覆：
1. emotional_support：先同理，接住情緒，不要急著給解法
2. general_chat：自然延續上下文
3. 如果使用者問今天還可以吃多少、熱量還剩多少，根據今日飲食狀況直接給具體數字
4. 回覆 1~2 小段，不要太長，不要像客服
`;
    const stream = await generateTextStream(streamPrompt);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Intent": intent,
        "Transfer-Encoding": "chunked",
      },
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "Chat error" }, { status: 500 });
  }
}