import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } from "@/lib/gemini";
import { buildSummaryPrompt, type DailySummary } from "@/lib/prompts";
import { supabase } from "@/lib/server/supabase";

async function generateText(model: string, prompt: string) {
  const result = await gemini.models.generateContent({ model, contents: prompt });
  return result.text ?? "";
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: unknown }).message ?? "");
  }
  return String(err ?? "");
}

async function generateTextWithFallback(prompt: string): Promise<string | null> {
  try {
    return await generateText(GEMINI_MODEL, prompt);
  } catch (e: unknown) {
    const retryable = /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED/.test(errorMessage(e));
    if (!retryable) throw e;
    try {
      return await generateText(GEMINI_FALLBACK_MODEL, prompt);
    } catch {
      return null;
    }
  }
}

type DbMessage = { role: "user" | "assistant"; text: string; created_at: string };

function todayYMD(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * POST /api/chat/summarize
 * body: { userId: string, date?: "YYYY-MM-DD" }
 *
 * 流程：
 * 1. 從 chat_messages 拉當日所有訊息
 * 2. 跑 summary prompt
 * 3. upsert 進 chat_summaries (user_id, date)
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, date } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const targetDate = date || todayYMD();
    const dayStart = `${targetDate}T00:00:00+08:00`;
    const dayEnd = `${targetDate}T23:59:59+08:00`;

    const { data: messages, error: msgErr } = await supabase
      .from("chat_messages")
      .select("role, text, created_at")
      .eq("user_id", userId)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd)
      .order("created_at", { ascending: true });

    if (msgErr) {
      return NextResponse.json({ error: msgErr.message }, { status: 500 });
    }

    if (!messages?.length) {
      return NextResponse.json({ summary: null, reason: "no messages" });
    }

    const conversationText = (messages as DbMessage[])
      .map((m) => `${m.role === "user" ? "使用者" : "助理"}：${m.text}`)
      .join("\n");

    const prompt = buildSummaryPrompt({ date: targetDate, conversationText });
    const text = await generateTextWithFallback(prompt);
    if (!text) {
      return NextResponse.json({ error: "summary generation failed" }, { status: 503 });
    }

    let parsed: DailySummary | null = null;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      return NextResponse.json({ error: "summary parse failed", raw: text }, { status: 500 });
    }

    const { error: upsertErr } = await supabase
      .from("chat_summaries")
      .upsert({
        user_id: userId,
        date: targetDate,
        summary_json: parsed,
      }, { onConflict: "user_id,date" });

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message, summary: parsed }, { status: 500 });
    }

    return NextResponse.json({ summary: parsed });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) || "summarize error" }, { status: 500 });
  }
}

/**
 * GET /api/chat/summarize?userId=xxx
 * 回傳最新一筆摘要（方便前端顯示/除錯）。
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("chat_summaries")
    .select("date, summary_json")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ summary: data?.summary_json ?? null, date: data?.date ?? null });
}
