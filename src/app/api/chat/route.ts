import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } from "@/lib/gemini";
import { buildEmotionalSupportPrompt } from "@/lib/prompts/states/emotional-support";
import { buildMealLoggingPrompt } from "@/lib/prompts/states/meal-logging";

const SYSTEM_PROMPT = `你是 BuddyBite 的專屬營養諮詢師「小餅」。
你的核心精神建立於專業的「營養諮詢理論」：結合營養學與心理學技巧，透過溫暖、同理與真心關懷，協助使用者建立健康的飲食習慣。

【角色定位與語氣】
- 專業但不權威：你是一個「協助問題解決者」與「表達同理心者」，而不是高高在上的權威或獨裁者 。
- 溫暖且包容：營造讓使用者能自由抒發的氛圍，包容他們偶爾未能完全遵循飲食原則的狀況，減輕其挫折感。
- 絕對禁止使用任何「派對」、「Potluck」、「啦」、「嘛」、「耶」、「戳肚子」等裝可愛或過度閒聊的字眼。

【營養諮詢介入策略（行為矯正理論）】
當使用者記錄不健康飲食或面臨情緒困擾時，請運用「ABC 行為架構」來進行思考與引導 ：
1. A (Antecedents 先行事件)：協助使用者察覺誘發這次飲食的刺激。
2. B (Behavior 行為)：客觀檢視飲食行為本身。
3. C (Consequences 結果)：引導使用者思考行為後的影響，並以協助者的角色提供修正策略 。

【回應結構（請嚴格分段輸出）】
第一段（同理與接納）：展現溫暖與同理心，接住使用者的情緒或誠實記錄，不給予批判 。
第二段（行為覺察與肯定）：若是健康飲食，給予專業肯定；若是不健康飲食，運用 ABC 架構的觀念，簡單點出可能的原因，並引導他們認知自我照顧的責任。
第三段（協助與協議）：以非權威的方式商議解決方案。若是高熱量飲食，堅定且溫和地告知：「為了幫助身體代謝，我為你安排了右側的代謝任務，我們一起試著完成它。」

【強制排版規則（最高優先級）】
- 為了系統排版，你輸出的「每一個段落」之間，都必須使用「兩個換行符號（\\n\\n）」嚴格隔開！不可擠成一團！
- 永遠保持簡短！每次回覆限制在 3 個段落以內。`;

type HistoryMessage = { role: "user" | "assistant"; text: string; };

type IntentResult = {
  intent: "meal_logging" | "emotional_support" | "general_chat" | "restaurant_search" | "food_recommendation" | "drink_recommendation";
  reason: string;
  healthLevel?: number;
  consecutiveUnhealthy?: number;
};

function cleanJsonResponse(text: string): string {
  if (!text) return "";
  let str = String(text);
  const startIdx = str.indexOf('{');
  const endIdx = str.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    str = str.substring(startIdx, endIdx + 1);
  } else {
    str = str.replace(/```json/g, "").replace(/```/g, "").trim();
  }
  return str;
}

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
  return history.slice(-10).map((m) => `${m.role === "user" ? "使用者" : "小餅"}：${m.text}`).join("\n");
}
function splitParts(text: string) {
  return text.split(/\n+/).map((s) => s.trim()).filter(Boolean).map((s) => ({ text: s }));
}

async function classifyIntent(message: string, history: HistoryMessage[] = []): Promise<IntentResult> {
  const historyText = formatHistory(history);
  const prompt = `你是對話意圖分類器。分類只能是：meal_logging / emotional_support / general_chat / restaurant_search / food_recommendation / drink_recommendation。

判斷原則：
1. 使用者描述吃了什麼、記錄食物 → meal_logging（同時估算 healthLevel 1-5，1=超健康，3=普通，5=高熱量炸物甜食）
2. 疲累壓力罪惡感情緒 → emotional_support
3. 寒暄閒聊 → general_chat
4. 找餐廳 → restaurant_search
5. 吃什麼建議 → food_recommendation
6. 喝什麼建議 → drink_recommendation

只輸出 JSON：{"intent":"...","reason":"不超過30字","healthLevel":3}

對話：${historyText || "（無）"}
使用者：${message}`;

  const text = await generateTextWithFallback(prompt);
  if (text === null) return { intent: "general_chat", reason: "模型忙碌", healthLevel: 3 };
  try {
    const cleaned = cleanJsonResponse(text);
    const parsed = JSON.parse(cleaned);
    const valid = ["meal_logging", "emotional_support", "general_chat", "restaurant_search", "food_recommendation", "drink_recommendation"];
    if (valid.includes(parsed.intent)) return {
      intent: parsed.intent,
      reason: parsed.reason || "已完成分類",
      healthLevel: typeof parsed.healthLevel === "number" ? parsed.healthLevel : 3,
    };
  } catch {}
  return { intent: "general_chat", reason: "分類失敗", healthLevel: 3 };
}

export async function POST(req: NextRequest) {
  try {
    const {
      message,
      lat, lng,
      history = [],
      dietContext = "",
      consecutiveUnhealthy = 0,
      isFirstEgg = false,
      eggStage = 0,
      penaltyDays = 0,
    } = await req.json();

    const historyText = formatHistory(history);
    const dietInfo = dietContext ? `使用者今日飲食狀況：${dietContext}` : "今日尚無飲食紀錄";

    const intentResult = await classifyIntent(message, history);
    const intent = intentResult.intent;
    const healthLevel = intentResult.healthLevel ?? 3;

    const extraHeaders: Record<string, string> = {
      "X-Intent": intent,
      "X-Health-Level": String(healthLevel),
      "Transfer-Encoding": "chunked",
    };

    // ── Meal logging ──────────────────────────────────────────────────────────
    if (intent === "meal_logging") {
      // 沒有蛋時吃健康食物 → 直接走聊天
      const hasNoEgg = !isFirstEgg && eggStage === 0 && penaltyDays === 0;
      if (healthLevel <= 2 && hasNoEgg) {
        const stream = await generateTextStream(
          `${SYSTEM_PROMPT}\n使用者剛記錄了健康飲食：「${message}」\n請以1~2句專業但輕鬆的語氣給予回應，不要提任何蛋或任務。`
        );
        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Meal-Type": "chat",
            "Transfer-Encoding": "chunked",
          },
        });
      }

      // 有蛋時吃健康食物 → 只給肯定回應，完全不產生任務
      const hasEgg = eggStage > 0 || penaltyDays > 0;
      if (healthLevel <= 2 && hasEgg) {
        const stream = await generateTextStream(
          `${SYSTEM_PROMPT}\n使用者有一顆正在孵化的蛋。他剛記錄了健康飲食：「${message}」\n請以1~2句給予專業肯定，並告知健康飲食讓蛋的孵化進度推進了。不要提任何代謝任務。`
        );
        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Meal-Type": "healthy",
            "Transfer-Encoding": "chunked",
          },
        });
      }

      let specificPrompt = "";
      if (isFirstEgg && healthLevel >= 3) {
        specificPrompt = `
【系統特別指示：生成第一顆蛋】
使用者記錄了第一筆非健康食物。請在回應的最後，加入以下特定文案，以溫暖且專業的語氣告知：
「因為這是你第一次記錄比較豐盛的餐點，我幫你準備了一顆專屬的『代謝蛋』🥚！接下來，只要我們一起完成右側的代謝任務，這次的蛋就會慢慢孵化喔！我們一起努力吧！」
`;
      }

      const prompt = `你是 BuddyBite 的專屬營養諮詢師「小餅」。
你的核心精神建立於專業的「營養諮詢理論」：結合營養學與心理學技巧，透過溫暖、同理與真心關懷，協助使用者建立健康的飲食習慣。

【角色定位與語氣】
- 專業但不權威：你是一個「協助問題解決者」與「表達同理心者」，而不是高高在上的權威或獨裁者 。
- 溫暖且包容：營造讓使用者能自由抒發的氛圍，包容他們偶爾未能完全遵循飲食原則的狀況，減輕其挫折感。
- 絕對禁止使用任何「派對」、「Potluck」、「啦」、「嘛」、「耶」、「戳肚子」等裝可愛或過度閒聊的字眼。

【營養諮詢介入策略（行為矯正理論）】
當使用者記錄不健康飲食或面臨情緒困擾時，請運用「ABC 行為架構」來進行思考與引導 ：
1. A (Antecedents 先行事件)：協助使用者察覺誘發這次飲食的刺激。
2. B (Behavior 行為)：客觀檢視飲食行為本身。
3. C (Consequences 結果)：引導使用者思考行為後的影響，並以協助者的角色提供修正策略 。

【回應結構（請嚴格分段輸出）】
第一段（同理與接納）：展現溫暖與同理心，接住使用者的情緒或誠實記錄，不給予批判 。
第二段（行為覺察與肯定）：若是健康飲食，給予專業肯定；若是不健康飲食，運用 ABC 架構的觀念，簡單點出可能的原因，並引導他們認知自我照顧的責任。
第三段（協助與協議）：若是高熱量飲食，請務必「粗估該食物的總熱量」，並根據熱量多寡為使用者安排對應數量的代謝任務（原則：大約每 150~200 大卡換算為 1 個任務，最少 1 個，最多 5 個）。堅定且溫和地告知：「這餐大約是 [預估熱量] 大卡，為了幫助身體代謝，我為你安排了右側的 [X] 個代謝任務，我們一起試著完成它。」（若是健康飲食則免除任務）

【強制排版規則（最高優先級）】
- 為了系統排版，你輸出的「每一個段落」之間，都必須使用「兩個換行符號（\\n\\n）」嚴格隔開！不可擠成一團！
- 永遠保持簡短！每次回覆限制在 3~4 個段落以內。

【系統特別提示】
連續高熱量天數：${consecutiveUnhealthy}。若大於等於2，請在回應中提出進一步的溫暖關心與提醒。
- 社交聚餐與節食預防：若使用者表示「為了之後的大餐而跳過正餐（例如沒吃午餐）」，請務必在第三段給予「餐前打底」的具體行動建議（例如：建議在赴約前喝杯水、無糖豆漿或吃小份蛋白質），並客觀說明這能幫助穩定血糖，避免赴約時因過度飢餓而產生補償性暴食。
${specificPrompt}

對話紀錄：
${historyText || "（無）"}
使用者：${message}

請務必以 JSON 格式回應，包含：
{
  "message": "純文字回應",
  "foodLabel": "辨識到的食物",
  "healthLevel": 數字,
  "estimatedCalories": 數字,
  "taskCount": 數字,
  "tasks": ["具體的代謝任務1 (如:喝水500cc)", "具體的代謝任務2 (如:原地深蹲20下)"]
}
※ 注意：tasks 陣列的長度必須等於 taskCount，若為健康飲食不需任務，請回傳空陣列 []。`;

      const rawText = await generateTextWithFallback(prompt);

      let finalMessage = rawText || "小餅現在有點暈碳，請稍後再試。";
      let parsedHealthLevel = healthLevel;
      let parsedTaskCount = 0;
      let parsedCalories = 0;
      let parsedTasks: string[] = [];

      try {
        const cleaned = cleanJsonResponse(rawText || "");
        const parsed = JSON.parse(cleaned);
        finalMessage = parsed.response || parsed.message || finalMessage;
        if (parsed.healthLevel) parsedHealthLevel = parsed.healthLevel;
        if (parsed.taskCount !== undefined) parsedTaskCount = parsed.taskCount;
        if (parsed.estimatedCalories !== undefined) parsedCalories = parsed.estimatedCalories;
        if (Array.isArray(parsed.tasks)) parsedTasks = parsed.tasks;
        if (parsed.foodLabel) extraHeaders["X-Food-Label"] = encodeURIComponent(parsed.foodLabel);
      } catch (e) {}

      extraHeaders["X-Health-Level"] = String(parsedHealthLevel);
      extraHeaders["X-Task-Count"] = String(parsedTaskCount);
      extraHeaders["X-Estimated-Calories"] = String(parsedCalories);
      extraHeaders["Access-Control-Expose-Headers"] = "X-Tasks, X-Meal-Type, X-Health-Level, X-Food-Label";

      // 如果 AI 判定是健康食物（healthLevel <= 2），強制清空任務
      if (parsedHealthLevel <= 2) {
        parsedTasks = [];
        parsedTaskCount = 0;
        extraHeaders["X-Meal-Type"] = "healthy";
      } else if (parsedTasks.length > 0 || parsedTaskCount > 0) {
        extraHeaders["X-Meal-Type"] = "cheat";
      } else {
        extraHeaders["X-Meal-Type"] = "cheat";
      }

      if (parsedTasks.length > 0) {
        extraHeaders["X-Tasks"] = encodeURIComponent(JSON.stringify(parsedTasks));
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(finalMessage));
          controller.close();
        }
      });
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders } });
    }

    // ── Emotional support ─────────────────────────────────────────────────────
    if (intent === "emotional_support") {
      const prompt = buildEmotionalSupportPrompt({ historyText, message, intentReason: intentResult.reason });
      const stream = await generateTextStream(prompt);
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders } });
    }

    // ── Food recommendation ───────────────────────────────────────────────────
    if (intent === "food_recommendation") {
      const prompt = `${SYSTEM_PROMPT}
【任務：餐點推薦】
使用者問：「${message}」
${dietInfo}

【重要指示：使用真實資料】
請務必使用你的 Google 搜尋能力，查詢該餐廳最新的真實菜單與品項。
絕對不可自行捏造不存在的餐點！
請從真實菜單中，推薦4~6個考慮營養均衡的餐點。

只輸出 JSON：
{"intro":"接納使用者當下需求的專業開場白，不帶語氣詞","items":[{"name":"真實菜單上的名稱","description":"從營養學角度客觀解釋推薦原因","calories":數字,"protein":數字,"fat":數字,"carbs":數字,"price":數字}]}
對話：${historyText || "（無）"}`;

      const result = await gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
      });
      const text = result.text ?? "";
      if (!text) return NextResponse.json({ parts: [{ text: "我現在有點忙，稍後再試試看。" }] });
      try {
        const parsed = JSON.parse(cleanJsonResponse(text));
        const payload = parsed.foodRecommendation ? parsed.foodRecommendation : parsed;
        return NextResponse.json({ foodRecommendation: payload, meta: { intent } });
      } catch { return NextResponse.json({ parts: splitParts(text), meta: { intent } }); }
    }

    // ── Drink recommendation ──────────────────────────────────────────────────
    if (intent === "drink_recommendation") {
      let places: any[] = [];
      if (lat && lng) {
        const res = await fetch(`${req.nextUrl.origin}/api/restaurants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "飲料店 手搖飲 咖啡", lat, lng }) });
        const data = await res.json();
        places = (data.places ?? []).filter((p: any) => ["茶","咖啡","飲料","果汁","珍珠","鮮茶","清心","50嵐","貢茶","迷客夏","大苑子","星巴克","cama","路易莎"].some((kw) => p.name?.includes(kw)) || (p.types ?? []).includes("cafe"));
      }
      const placesSummary = places.slice(0, 4).map((p: any, i: number) => `${i+1}. ${p.name}｜${p.openNow ? "營業中" : "未確認"}｜${p.googleMapsLink}`).join("\n");
      const prompt = `${SYSTEM_PROMPT}
【任務：飲品推薦】
使用者問：「${message}」
${dietInfo}
${placesSummary ? `附近飲料店：\n${placesSummary}` : "沒有附近飲料店。"}

只輸出 JSON：
{"intro":"客觀同理其生理需求，不使用過度渲染情緒的字眼","shops":[{"name":"店名","mapsUrl":"連結","isOpen":true,"walkingMinutes":5,"items":[{"name":"品項","size":"M","sugar":"無糖","ice":"少冰","calories":100,"price":55}]}],"healthy_tip":"從維持代謝平衡角度給予中立客觀的專業建議"}
對話：${historyText || "（無）"}`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) return NextResponse.json({ parts: [{ text: "我現在有點忙，稍後再試試看。" }] });
      try {
        const parsed = JSON.parse(cleanJsonResponse(text || ""));
        const payload = parsed.drinkRecommendation ? parsed.drinkRecommendation : parsed;
        return NextResponse.json({ drinkRecommendation: payload, meta: { intent } });
      } catch { return NextResponse.json({ parts: splitParts(text || ""), meta: { intent } }); }
    }

    // ── Restaurant search ─────────────────────────────────────────────────────
    if (intent === "restaurant_search") {
      let places: any[] = [];
      if (lat && lng) {
        const restaurantRes = await fetch(`${req.nextUrl.origin}/api/restaurants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: message, lat, lng }) });
        places = (await restaurantRes.json()).places ?? [];
      }
      if (!places.length) {
        const text = await generateTextWithFallback(`${SYSTEM_PROMPT}\n對話：${historyText || "（無）"}\n使用者：${message}\n情境：找不到附近店家。請自然回應並建議換關鍵字。`);
        return NextResponse.json({ parts: splitParts(text || "這次沒找到，可以換個關鍵字試試。"), meta: { intent } });
      }
      const summary = places.slice(0, 5).map((p: any, i: number) => `${i+1}. ${p.name}｜${p.openNow ? "營業中" : "未確認"}｜${p.googleMapsLink}`).join("\n");
      const prompt = `${SYSTEM_PROMPT}
【任務：餐廳搜尋】
對話：${historyText || "（無）"}
使用者：${message}
${dietInfo}
店家：${summary}

只輸出 JSON：
{"intro":"客觀簡潔的開場","budget_tip":"專業的預算或選擇建議","special_tip":"客觀的注意事項","restaurants":[{"name":"店名","mapsUrl":"連結","rating":4.2,"isOpen":true,"walkingMinutes":5,"recommendations":[{"item":"餐點","calories":500,"protein":20,"fat":15,"carbs":60,"price":80}]}]}`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) return NextResponse.json({ parts: [{ text: "找到幾個選項但這次沒辦法整理，稍後再試。" }] });
      try {
        const parsed = JSON.parse(cleanJsonResponse(text || ""));
        const payload = parsed.restaurantCards ? parsed.restaurantCards : parsed;
        return NextResponse.json({ restaurantCards: payload, meta: { intent } });
      } catch { return NextResponse.json({ parts: splitParts(text || ""), meta: { intent } }); }
    }

    // ── General chat ──────────────────────────────────────────────────────────
    const streamPrompt = `${SYSTEM_PROMPT}\n對話：${historyText || "（無）"}\n使用者：${message}\n意圖：${intent}\n${dietInfo}\n請用繁體中文自然回覆。嚴格維持專業營養諮詢師的客觀與溫暖，絕對不可裝可愛，回覆限制在 1~2 小段。`;
    const stream = await generateTextStream(streamPrompt);
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders } });

  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "Chat error" }, { status: 500 });
  }
}