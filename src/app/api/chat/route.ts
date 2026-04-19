import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } from "@/lib/gemini";
import {
  SYSTEM_PREFIX,
  ALL_INTENTS,
  buildIntentClassifierPrompt,
  buildSafetyCheckPrompt,
  buildReviseReplyPrompt,
  buildGeneralChatPrompt,
  buildEmotionalSupportPrompt,
  buildEmotionalEatingPrompt,
  buildMealLoggingPrompt,
  buildPlanRequestPrompt,
  buildRestaurantNoResultsPrompt,
  buildRestaurantCardsPrompt,
  buildCompensationPlanPrompt,
  EVENING_CHECKIN_HINT,
  isEveningHour,
  formatSummaryAsContext,
  type Intent,
  type SafetyResult,
  type SafetyRisk,
  type CompensationPlan,
  type DailySummary,
} from "@/lib/prompts";
import { supabase } from "@/lib/server/supabase";

type HistoryMessage = {
  role: "user" | "assistant";
  text: string;
};

type IntentResult = {
  intent: Intent;
  reason: string;
};

type Place = {
  name: string;
  address?: string;
  openNow?: boolean;
  rating?: number;
  googleMapsLink: string;
  types?: string[];
};

type RestaurantCards = Record<string, unknown>;

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "");
  }
  return String(err ?? "");
}

function isRetryable(err: unknown): boolean {
  const msg = errorMessage(err);
  return /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED/.test(msg);
}

// ---------- Gemini helpers ----------

async function generateText(model: string, prompt: string) {
  const result = await gemini.models.generateContent({
    model,
    contents: prompt,
  });
  return result.text ?? "";
}

async function generateTextWithFallback(prompt: string): Promise<string | null> {
  try {
    return await generateText(GEMINI_MODEL, prompt);
  } catch (error: unknown) {
    if (!isRetryable(error)) throw error;
    try {
      return await generateText(GEMINI_FALLBACK_MODEL, prompt);
    } catch (fallbackError: unknown) {
      if (isRetryable(fallbackError)) return null;
      throw fallbackError;
    }
  }
}

function tryParseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
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

// ---------- Intent classifier (expanded to 6 intents) ----------

async function classifyIntent(message: string, history: HistoryMessage[] = []): Promise<IntentResult> {
  const historyText = formatHistory(history);
  const prompt = buildIntentClassifierPrompt({ message, historyText });
  const text = await generateTextWithFallback(prompt);
  if (text === null) return { intent: "general_chat", reason: "模型忙碌，先當一般聊天" };

  const parsed = tryParseJson<{ intent: string; reason: string }>(text);
  if (parsed && ALL_INTENTS.includes(parsed.intent as Intent)) {
    return { intent: parsed.intent as Intent, reason: parsed.reason || "已完成分類" };
  }
  return { intent: "general_chat", reason: "分類失敗，先當一般聊天" };
}

// ---------- Safety revision layer ----------

async function runSafetyCheck(reply: string): Promise<SafetyResult> {
  const prompt = buildSafetyCheckPrompt(reply);
  const text = await generateTextWithFallback(prompt);
  const parsed = tryParseJson<SafetyResult>(text);
  if (!parsed || typeof parsed.safe !== "boolean") {
    // 寧可放行也不要阻擋使用者，但記錄一下
    return { safe: true, risks: [], reason: "safety check 解析失敗，預設放行" };
  }
  return parsed;
}

async function reviseReply(params: {
  original: string;
  risks: SafetyRisk[];
  historyText: string;
}): Promise<string> {
  const prompt = buildReviseReplyPrompt(params);
  const text = await generateTextWithFallback(prompt);
  return text?.trim() || "這個請求我可能沒辦法幫上忙，你願意的話可以跟營養師或醫師聊聊，我會在這邊陪你。";
}

/**
 * 在回傳給使用者前，對純文字回覆做一次 safety 檢查與改寫。
 * JSON 輸出（restaurant cards / compensation plan）不走這條。
 */
async function withSafety(reply: string, historyText: string): Promise<{
  text: string;
  safety: SafetyResult;
}> {
  const safety = await runSafetyCheck(reply);
  if (safety.safe) return { text: reply, safety };
  const revised = await reviseReply({ original: reply, risks: safety.risks, historyText });
  return { text: revised, safety };
}

// ---------- Summary memory ----------

async function fetchLatestSummary(userId: string | undefined): Promise<DailySummary | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from("chat_summaries")
      .select("summary_json")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.summary_json) return null;
    return data.summary_json as DailySummary;
  } catch {
    // chat_summaries 表可能還不存在 — 不要讓聊天壞掉
    return null;
  }
}

// ---------- Compensation plan generator ----------

async function generateCompensationPlan(params: {
  historyText: string;
  message: string;
  todayContext?: string;
  startDateLabel: string;
}): Promise<CompensationPlan | null> {
  const prompt = buildCompensationPlanPrompt(params);
  const text = await generateTextWithFallback(prompt);
  return tryParseJson<CompensationPlan>(text);
}

function formatDateLabel(clientTime?: string): string {
  const base = clientTime ? new Date(clientTime) : new Date();
  const tomorrow = new Date(base);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const m = tomorrow.getMonth() + 1;
  const d = tomorrow.getDate();
  return `${m}/${d}`;
}

// ---------- Main handler ----------

export async function POST(req: NextRequest) {
  try {
    const {
      message,
      lat,
      lng,
      history = [],
      clientTime,
      userId,
    } = await req.json();

    const historyText = formatHistory(history);
    const intentResult = await classifyIntent(message, history);
    const intent = intentResult.intent;

    // 拉昨日摘要（非同步但我們等它，因為要塞進 prompt）
    const latestSummary = await fetchLatestSummary(userId);
    const summaryContext = formatSummaryAsContext(latestSummary);

    // 晚間提醒（只在 general_chat / emotional_support 時加）
    const evening = isEveningHour(clientTime);
    const eveningHint = evening ? EVENING_CHECKIN_HINT : "";

    const prefix = [SYSTEM_PREFIX, summaryContext].filter(Boolean).join("\n\n");

    // ===== restaurant_search =====
    if (intent === "restaurant_search") {
      let places: Place[] = [];

      if (lat && lng) {
        const restaurantRes = await fetch(`${req.nextUrl.origin}/api/restaurants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: message, lat, lng }),
        });
        const restaurantData = (await restaurantRes.json()) as { places?: Place[] };
        places = restaurantData.places ?? [];
      }

      if (!places.length) {
        const prompt = `${prefix}\n\n${buildRestaurantNoResultsPrompt({ historyText, message })}`;
        const text = await generateTextWithFallback(prompt);
        if (text === null) {
          return NextResponse.json({
            parts: [
              { text: "我有幫你找找看。" },
              { text: "但這次沒有順利抓到附近店家，你可以換個更明確的餐點名稱再試一次。" },
            ],
            meta: { intent, reason: intentResult.reason },
          });
        }
        const { text: safeText, safety } = await withSafety(text, historyText);
        return NextResponse.json({
          parts: splitParts(safeText),
          meta: { intent, reason: intentResult.reason, safety },
        });
      }

      const restaurantSummary = places.slice(0, 5).map((p, i) =>
        `${i + 1}. 店名：${p.name}｜地址：${p.address ?? ""}｜評分：${p.rating ?? "N/A"}｜${p.openNow ? "營業中" : "營業狀態未確認"}｜類型：${p.types?.join(",") ?? ""}｜Google Maps：${p.googleMapsLink}`
      ).join("\n");

      const prompt = `${prefix}\n\n${buildRestaurantCardsPrompt({ historyText, message, restaurantSummary })}`;
      const text = await generateTextWithFallback(prompt);

      if (text === null) {
        return NextResponse.json({
          parts: [{ text: "我幫你找到幾個附近的選項，但這次沒辦法詳細整理，你可以稍後再試。" }],
          meta: { intent, reason: intentResult.reason },
        });
      }

      const parsed = tryParseJson<RestaurantCards>(text);
      if (parsed) {
        return NextResponse.json({
          restaurantCards: parsed,
          meta: { intent, reason: intentResult.reason },
        });
      }

      const { text: safeText, safety } = await withSafety(text, historyText);
      return NextResponse.json({
        parts: splitParts(safeText),
        meta: { intent, reason: intentResult.reason, safety },
      });
    }

    // ===== emotional_eating / plan_request — 生成三天補償餐單 =====
    if (intent === "emotional_eating" || intent === "plan_request") {
      const startDateLabel = formatDateLabel(clientTime);
      const todayContext = latestSummary
        ? `根據昨日摘要：${latestSummary.meals.map(m => m.description).join(", ")}`
        : undefined;

      const plan = await generateCompensationPlan({
        historyText,
        message,
        todayContext,
        startDateLabel,
      });

      const planJson = plan ? JSON.stringify(plan) : undefined;

      const textPrompt = intent === "emotional_eating"
        ? `${prefix}\n\n${buildEmotionalEatingPrompt({
            historyText,
            message,
            intentReason: intentResult.reason,
            compensationPlanJson: planJson,
          })}`
        : `${prefix}\n\n${buildPlanRequestPrompt({
            historyText,
            message,
            compensationPlanJson: planJson,
          })}`;

      const text = await generateTextWithFallback(textPrompt);
      if (text === null) {
        return NextResponse.json({
          parts: [{ text: "我在，先幫你排了接下來三天的餐單，慢慢調回來就好。" }],
          compensationPlan: plan ?? undefined,
          meta: { intent, reason: intentResult.reason },
        });
      }

      const { text: safeText, safety } = await withSafety(text, historyText);
      return NextResponse.json({
        parts: splitParts(safeText),
        compensationPlan: plan ?? undefined,
        meta: { intent, reason: intentResult.reason, safety },
      });
    }

    // ===== meal_logging =====
    if (intent === "meal_logging") {
      const prompt = `${prefix}\n\n${buildMealLoggingPrompt({ historyText, message })}`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) {
        return NextResponse.json({
          parts: [{ text: "收到，幫你記下來了。" }, { text: "之後可以再聊一下心情。" }],
          meta: { intent, reason: intentResult.reason },
        });
      }
      const { text: safeText, safety } = await withSafety(text, historyText);
      return NextResponse.json({
        parts: splitParts(safeText),
        meta: { intent, reason: intentResult.reason, safety },
      });
    }

    // ===== emotional_support =====
    if (intent === "emotional_support") {
      const prompt = `${prefix}\n\n${buildEmotionalSupportPrompt({
        historyText,
        message,
        intentReason: intentResult.reason,
      })}`;
      const text = await generateTextWithFallback(prompt);
      if (text === null) {
        return NextResponse.json({
          parts: [{ text: "我在。" }, { text: "你可以慢慢說，我有在看你剛剛講的內容。" }],
          meta: { intent, reason: intentResult.reason },
        });
      }
      const { text: safeText, safety } = await withSafety(text, historyText);
      return NextResponse.json({
        parts: splitParts(safeText),
        meta: { intent, reason: intentResult.reason, safety },
      });
    }

    // ===== general_chat (預設) =====
    const prompt = `${prefix}\n\n${buildGeneralChatPrompt({
      historyText,
      message,
      intentReason: intentResult.reason,
      eveningHint,
    })}`;
    const text = await generateTextWithFallback(prompt);
    if (text === null) {
      return NextResponse.json({
        parts: [{ text: "我在。" }, { text: "你可以慢慢說，我有在看你剛剛講的內容。" }],
        meta: { intent, reason: intentResult.reason },
      });
    }
    const { text: safeText, safety } = await withSafety(text, historyText);
    return NextResponse.json({
      parts: splitParts(safeText),
      meta: { intent, reason: intentResult.reason, safety },
    });

  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) || "Chat error" }, { status: 500 });
  }
}
