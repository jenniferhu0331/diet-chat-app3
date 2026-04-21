import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } from "@/lib/gemini";
import { SYSTEM_PROMPT } from "@/lib/prompts";

type HistoryMessage = { role: "user" | "assistant"; text: string; };
type IntentResult = { intent: "emotional_support" | "general_chat" | "restaurant_search" | "food_recommendation" | "drink_recommendation" | "gratitude_chat"; reason: string; };

async function generateText(model: string, prompt: string) {
  const result = await gemini.models.generateContent({ model, contents: prompt });
  return result.text ?? "";
}

async function generateTextWithFallback(prompt: string) {
  try { return await generateText(GEMINI_MODEL, prompt); }
  catch (error: any) {
    const msg = String(error?.message || "");
    if (!msg.includes("503") && !msg.includes("UNAVAILABLE") && !msg.includes("429") && !msg.includes("RESOURCE_EXHAUSTED")) throw error;
    try { return await generateText(GEMINI_FALLBACK_MODEL, prompt); }
    catch (fallbackError: any) {
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
        const result = await gemini.models.generateContentStream({ model: GEMINI_MODEL, contents: prompt });
        for await (const chunk of result) { const text = chunk.text ?? ""; if (text) controller.enqueue(encoder.encode(text)); }
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

const GRATITUDE_PERSONA = `你是一個活潑、真誠的大學生朋友，用mindful的方式傾聽對方。回應簡短，語氣自然放鬆像朋友聊天，不要正式。不要給建議、不要分析、不要評判。根據對方分享的內容，幫助他們探索情緒、經歷、感謝的源頭。避免重複的開場白、制式化表達。每次回應結尾加一個簡短的開放式問題，幫助使用者反思感恩事件。問題要簡單、輕鬆、友善。使用繁體中文。`;

async function classifyIntent(message: string, history: HistoryMessage[] = []): Promise<IntentResult> {
  const historyText = formatHistory(history);
  const prompt = `你是對話意圖分類器。分類只能是：emotional_support / general_chat / restaurant_search / food_recommendation / drink_recommendation / gratitude_chat。
判斷原則：1.疲累壓力罪惡感→emotional_support 2.寒暄→general_chat 3.找餐廳→restaurant_search 4.吃什麼→food_recommendation 5.喝什麼→drink_recommendation 6.感恩感謝開心的事→gratitude_chat
只輸出JSON：{"intent":"...","reason":"不超過30字"}
對話：${historyText || "（無）"}\n使用者：${message}`;
  const text = await generateTextWithFallback(prompt);
  if (text === null) return { intent: "general_chat", reason: "模型忙碌" };
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    const valid = ["emotional_support","general_chat","restaurant_search","food_recommendation","drink_recommendation","gratitude_chat"];
    if (valid.includes(parsed.intent)) return { intent: parsed.intent, reason: parsed.reason || "已完成分類" };
  } catch {}
  return { intent: "general_chat", reason: "分類失敗" };
}

export async function POST(req: NextRequest) {
  try {
    const { message, lat, lng, history = [], dietContext = "", isGratitudeMode = false, gratitudeStep = 0 } = await req.json();
    const historyText = formatHistory(history);
    const dietInfo = dietContext ? `使用者今日飲食狀況：${dietContext}` : "今日尚無飲食紀錄";

    // ===== gratitude_chat =====
    if (isGratitudeMode) {
      if (message && (message.includes("記錄") || message.includes("存") || message.includes("好了") || message.includes("就這樣"))) {
        return NextResponse.json({ gratitudeSave: true, text: "好，幫你記下來了 🌸 今天分享的這些，等你以後翻出來看，應該會覺得很溫暖。", meta: { intent: "gratitude_chat" } });
      }
      let systemPrompt = "";
      if (!message) {
        systemPrompt = `${GRATITUDE_PERSONA}\n\n現在主動開口詢問使用者今天有什麼想感謝的事。語氣輕鬆自然像朋友傍晚聊天，一句話就好，結尾加一個開放式問題。`;
      } else {
        systemPrompt = `${GRATITUDE_PERSONA}\n\n對話紀錄：\n${historyText || "（無）"}\n\n使用者說：「${message}」\n\n請針對使用者剛才說的內容自然回應，不要重新問今天有什麼感謝的事。在結尾加一個輕鬆的反問幫助他繼續探索這件事。回應要簡短，2~3句話就好。`;
      }
      const stream = await generateTextStream(systemPrompt);
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Intent": "gratitude_chat", "Transfer-Encoding": "chunked" } });
    }

    const intentResult = await classifyIntent(message, history);
    const intent = intentResult.intent;

    if (intent === "gratitude_chat") {
      const systemPrompt = `${GRATITUDE_PERSONA}\n\n對話紀錄：\n${historyText || "（無）"}\n\n使用者說：「${message}」\n\n請針對使用者剛才說的內容自然回應，不要重新問今天有什麼感謝的事。在結尾加一個輕鬆的反問幫助他繼續探索這件事。2~3句話就好。`;
      const stream = await generateTextStream(systemPrompt);
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Intent": "gratitude_chat", "Transfer-Encoding": "chunked" } });
    }

    if (intent === "food_recommendation") {
      const prompt = `使用者問：「${message}」\n${dietInfo}\n推薦4~6個餐點。只輸出JSON：{"intro":"開場","items":[{"name":"名稱","description":"原因","calories":數字,"protein":數字,"fat":數字,"carbs":數字,"price":數字}]}\n對話：${historyText || "（無）"}`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) return NextResponse.json({ parts: [{ text: "我現在有點忙，稍後再試試看。" }] });
      try { return NextResponse.json({ foodRecommendation: JSON.parse(text.replace(/```json|```/g, "").trim()), meta: { intent } }); }
      catch { return NextResponse.json({ parts: splitParts(text), meta: { intent } }); }
    }

    if (intent === "drink_recommendation") {
      let places: any[] = [];
      if (lat && lng) {
        const res = await fetch(`${req.nextUrl.origin}/api/restaurants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "飲料店 手搖飲 咖啡", lat, lng }) });
        const data = await res.json();
        places = (data.places ?? []).filter((p: any) => ["茶","咖啡","飲料","果汁","珍珠","鮮茶","清心","50嵐","貢茶","迷客夏","大苑子","星巴克","cama","路易莎"].some((kw) => p.name?.includes(kw)) || (p.types ?? []).includes("cafe"));
      }
      const placesSummary = places.slice(0, 4).map((p: any, i: number) => `${i+1}. ${p.name}｜${p.openNow ? "營業中" : "未確認"}｜${p.googleMapsLink}`).join("\n");
      const prompt = `使用者問：「${message}」\n${dietInfo}\n${placesSummary ? `附近飲料店：\n${placesSummary}` : "沒有附近飲料店。"}\n只輸出JSON：{"intro":"開場","shops":[{"name":"店名","mapsUrl":"連結","isOpen":true,"walkingMinutes":5,"items":[{"name":"品項","size":"M","sugar":"無糖","ice":"少冰","calories":100,"price":55}]}],"healthy_tip":"建議"}\n對話：${historyText || "（無）"}`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) return NextResponse.json({ parts: [{ text: "我現在有點忙，稍後再試試看。" }] });
      try { return NextResponse.json({ drinkRecommendation: JSON.parse(text.replace(/```json|```/g, "").trim()), meta: { intent } }); }
      catch { return NextResponse.json({ parts: splitParts(text), meta: { intent } }); }
    }

    if (intent === "restaurant_search") {
      let places: any[] = [];
      if (lat && lng) {
        const restaurantRes = await fetch(`${req.nextUrl.origin}/api/restaurants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: message, lat, lng }) });
        places = (await restaurantRes.json()).places ?? [];
      }
      if (!places.length) {
        const text = await generateTextWithFallback(`${SYSTEM_PROMPT}\n對話：${historyText || "（無）"}\n使用者：${message}\n情境：找不到附近店家。請自然回應並建議換關鍵字。`);
        return NextResponse.json({ parts: splitParts(text ?? "這次沒找到，可以換個關鍵字試試。"), meta: { intent } });
      }
      const summary = places.slice(0, 5).map((p: any, i: number) => `${i+1}. ${p.name}｜${p.openNow ? "營業中" : "未確認"}｜${p.googleMapsLink}`).join("\n");
      const prompt = `${SYSTEM_PROMPT}\n對話：${historyText || "（無）"}\n使用者：${message}\n${dietInfo}\n店家：${summary}\n只輸出JSON：{"intro":"開場","budget_tip":"省錢","special_tip":"特別","restaurants":[{"name":"店名","mapsUrl":"連結","rating":4.2,"isOpen":true,"walkingMinutes":5,"recommendations":[{"item":"餐點","calories":500,"protein":20,"fat":15,"carbs":60,"price":80}]}]}`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) return NextResponse.json({ parts: [{ text: "找到幾個選項但這次沒辦法整理，稍後再試。" }] });
      try { return NextResponse.json({ restaurantCards: JSON.parse(text.replace(/```json|```/g, "").trim()), meta: { intent } }); }
      catch { return NextResponse.json({ parts: splitParts(text), meta: { intent } }); }
    }

    const streamPrompt = `${SYSTEM_PROMPT}\n你是以情緒支持為主的聊天助理。\n對話：${historyText || "（無）"}\n使用者：${message}\n意圖：${intent}\n${dietInfo}\n請用繁體中文自然回覆，1~2小段，不要太長不要像客服。`;
    const stream = await generateTextStream(streamPrompt);
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "X-Intent": intent, "Transfer-Encoding": "chunked" } });

  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "Chat error" }, { status: 500 });
  }
}
