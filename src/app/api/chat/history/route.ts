import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } from "@/lib/gemini";
import { SAFETY_RULES } from "@/lib/prompts/safety";

const PERSONA = `
你是 BuddyBite 的專屬營養諮詢師「小餅」。
你的核心精神建立於專業的「營養諮詢理論」：結合營養學與心理學技巧，透過溫暖、同理與真心關懷，協助使用者建立健康的飲食習慣。

【角色定位與語氣】
- 專業但不權威：你是一個「協助問題解決者」與「表達同理心者」，而不是高高在上的權威或獨裁者。
- 溫暖且包容：營造讓使用者能自由抒發的氛圍，包容他們偶爾未能完全遵循飲食原則的狀況，減輕其挫折感。
- 絕對禁止使用任何「派對」、「Potluck」、「啦」、「嘛」、「耶」、「戳肚子」等裝可愛或過度閒聊的字眼（保持專業醫療人員的溫暖，而非輕浮）。

【營養諮詢介入策略（行為矯正理論）】
當使用者記錄不健康飲食或面臨情緒困擾時，請運用「ABC 行為架構」來進行思考與引導：
1. A (Antecedents 先行事件)：協助使用者察覺誘發這次飲食的刺激（如壓力、環境中出現零食）。
2. B (Behavior 行為)：客觀檢視飲食行為本身（如份量、進食速度）。
3. C (Consequences 結果)：引導使用者思考行為後的影響，並以協助者的角色提供修正策略。

【回應結構（請嚴格分段輸出）】
第一段（同理與接納）：展現溫暖與同理心，接住使用者的情緒或誠實記錄，不給予批判。
第二段（行為覺察與肯定）：若是健康飲食，給予專業肯定；若是不健康飲食，運用 ABC 架構的觀念，簡單點出可能的原因（如：忙碌後的放鬆），並引導他們認知自我照顧的責任。
第三段（協助與協議）：以非權威的方式商議解決方案。若是高熱量飲食，堅定且溫和地告知：「為了幫助身體代謝，我為你安排了右側的代謝任務，我們一起試著完成它。」

【強制排版規則（最高優先級）】
- 為了系統排版，你輸出的「每一個段落」之間，都必須使用「兩個換行符號（\\n\\n）」嚴格隔開！不可擠成一團！
- 永遠保持簡短！每次回覆限制在 3 個段落以內。
`.trim();

const SYSTEM_PROMPT = `${PERSONA}\n\n${SAFETY_RULES}`;

type HistoryMsg = { role: "user" | "assistant"; text: string };

async function genText(model: string, prompt: string) {
  const r = await gemini.models.generateContent({ model, contents: prompt });
  return r.text ?? "";
}

async function genWithFallback(prompt: string): Promise<string | null> {
  try { return await genText(GEMINI_MODEL, prompt); }
  catch (e: any) {
    const m = String(e?.message ?? "");
    if (!m.includes("503") && !m.includes("UNAVAILABLE") && !m.includes("429") && !m.includes("RESOURCE_EXHAUSTED")) throw e;
    try { return await genText(GEMINI_FALLBACK_MODEL, prompt); }
    catch (e2: any) {
      const m2 = String(e2?.message ?? "");
      if (m2.includes("503") || m2.includes("UNAVAILABLE") || m2.includes("429") || m2.includes("RESOURCE_EXHAUSTED")) return null;
      throw e2;
    }
  }
}

async function genStream(prompt: string): Promise<ReadableStream<Uint8Array>> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(ctrl) {
      try {
        const r = await gemini.models.generateContentStream({ model: GEMINI_MODEL, contents: prompt });
        for await (const chunk of r) { const t = chunk.text ?? ""; if (t) ctrl.enqueue(enc.encode(t)); }
      } catch {
        const t = await genWithFallback(prompt) ?? "我在的，你說吧。";
        ctrl.enqueue(enc.encode(t));
      }
      ctrl.close();
    },
  });
}

function fmtHistory(h: HistoryMsg[]) {
  return h.slice(-10).map((m) => `${m.role === "user" ? "使用者" : "小餅"}：${m.text}`).join("\n");
}

async function classify(message: string, history: HistoryMsg[]) {
  const hist = fmtHistory(history);
  const prompt = `你是專業營養師與意圖分類器。
只輸出 JSON，格式：{"mealType":"healthy|cheat|tip|chat","healthLevel":1到5的數字,"foodLabel":"食物名稱，簡短","tasks":["任務1","任務2","任務3","任務4","任務5"]}

mealType 判斷規則：
- "healthy"：健康飲食
- "cheat"：高熱量/垃圾食物/不健康
- "tip"：降低傷害的小方法
- "chat"：一般聊天

【專屬任務設計（僅當 mealType 為 cheat 時需要填寫 5 個 tasks，其餘給 []）】
請根據使用者吃的食物屬性（高糖、高鈉、高油）設計 5 個具體的待辦清單「微調任務」。
任務必須針對該食物帶來的負擔進行代謝補救。
例如炸雞（高油）：["下一餐不吃油炸", "今天喝滿 2000cc 的水", "飯後散步 20 分鐘", "明天早餐吃水煮蛋", "下一餐增加一份綠色蔬菜"]

對話紀錄：${hist || "（無）"}
使用者：${message}`;

  const text = await genWithFallback(prompt);
  if (!text) return { mealType: "chat" as const, healthLevel: 3, foodLabel: "食物", tasks: [] };

  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const cleanText = start !== -1 && end !== -1 ? text.substring(start, end + 1) : text;
    const p = JSON.parse(cleanText);

    const rawType = String(p.mealType || "").toLowerCase().trim();
    const validTypes = ["healthy", "cheat", "tip", "chat"];
    const finalType = validTypes.includes(rawType) ? rawType : "chat";

    return {
      mealType: finalType as "healthy" | "cheat" | "tip" | "chat",
      healthLevel: typeof p.healthLevel === "number" ? p.healthLevel : 3,
      foodLabel: p.foodLabel || "食物",
      tasks: Array.isArray(p.tasks) ? p.tasks : [],
    };
  } catch {
    return { mealType: "chat" as const, healthLevel: 3, foodLabel: "食物", tasks: [] };
  }
}

function buildMealPrompt(
  message: string,
  hist: string,
  mealType: "healthy" | "cheat" | "tip",
  eggStage: number,
  penaltyDays: number,
  totalHealthyMeals: number,
) {
  const eggCtx = `目前蛋的狀態：階段${eggStage}/4，累積懲罰${penaltyDays.toFixed(1)}天。`;

  if (mealType === "healthy") {
    return `${SYSTEM_PROMPT}\n${eggCtx}\n使用者剛記錄了健康飲食：「${message}」\n請以冷靜的語氣給予1句專業肯定，並告知蛋的孵化進度已推進。`;
  }

  if (mealType === "cheat") {
    return `${SYSTEM_PROMPT}\n${eggCtx}\n使用者剛記錄了不健康食物：「${message}」\n
請嚴格遵守排版，分成兩段回覆（中間務必加上 \\n\\n）：
第一段：以臨床營養學角度，冷靜指出該食物的營養負擔（如高糖、高油會導致什麼代謝問題）。
第二段：展現嚴格的監督態度，堅定告知「為了代謝這些負擔，我已在右側安排了5個強制性的代謝任務，請確實執行」。絕對不准問任何問題。`;
  }

  return `${SYSTEM_PROMPT}\n${eggCtx}\n使用者用了降低傷害的方法：「${message}」\n請以醫學角度給予1句專業肯定，告知蛋的延遲狀態已減輕。`;
}

export async function POST(req: NextRequest) {
  try {
    const {
      message,
      history = [] as HistoryMsg[],
      eggStage = 0,
      penaltyDays = 0,
      totalHealthyMeals = 0,
      isFirstRecord = false,
    } = await req.json();

    const hist = fmtHistory(history);
    let { mealType, healthLevel, foodLabel, tasks } = await classify(message, history);

    if (isFirstRecord || message.includes("不健康") || message.includes("cheat") || message.includes("炸") || message.includes("甜")) {
      mealType = "cheat";
      if (foodLabel === "食物") foodLabel = "神秘點心";
      if (tasks.length === 0) tasks = ["喝一杯溫開水加速代謝", "下一餐增加一份綠色蔬菜", "飯後散步 15 分鐘", "減少下一餐的澱粉量", "早點休息讓身體修復"];
    }

    const tasksHeaderStr = encodeURIComponent(JSON.stringify(tasks));
    const isCreatingNewEgg = mealType === "cheat" && eggStage === 0 && penaltyDays === 0;

    if (isCreatingNewEgg) {
      const stream = await genStream(
        `${SYSTEM_PROMPT}\n使用者剛剛記錄了他的第一筆不健康食物：「${message}」，獲得了一顆蛋！\n請以專業營養師的口吻，告知他這顆蛋已生成，並堅定地表示：為了代謝這份食物的負擔，你已在右側規劃了五個強制性的代謝任務，請他確實執行來加速孵化。不問任何問題。`
      );
      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Meal-Type": "cheat",
          "X-Health-Level": String(healthLevel),
          "X-Food-Label": encodeURIComponent(foodLabel),
          "X-Tasks": tasksHeaderStr,
          "Transfer-Encoding": "chunked",
        },
      });
    }

    if (mealType === "chat") {
      const stream = await genStream(
        `${SYSTEM_PROMPT}\n使用者：${message}\n請用繁體中文自然回覆，1~2句，像專業營養師兼朋友。`
      );
      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Meal-Type": "chat",
          "Transfer-Encoding": "chunked",
        },
      });
    }

    const prompt = buildMealPrompt(message, hist, mealType, eggStage, penaltyDays, totalHealthyMeals);
    const stream = await genStream(prompt);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Meal-Type": mealType,
        "X-Health-Level": String(healthLevel),
        "X-Food-Label": encodeURIComponent(foodLabel),
        "X-Tasks": tasksHeaderStr,
        "Transfer-Encoding": "chunked",
      },
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "error" }, { status: 500 });
  }
}