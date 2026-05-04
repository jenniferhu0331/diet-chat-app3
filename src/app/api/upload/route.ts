import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";

    const result = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            {
              text: `你是 BuddyBite 的營養諮詢師「小餅」。請分析這張照片中的食物。

請務必以 JSON 格式回應：
{
  "analysis": "分析文字（2~3句，繁體中文，專業語氣）。第一句描述食物是什麼。第二句從營養學角度評估。第三句告知可以在對話框輸入食物名稱來記錄。",
  "healthLevel": 健康程度1到5的數字（1=超健康蔬果，2=健康，3=普通，4=稍高熱量，5=高熱量炸物甜食），
  "foodLabel": "辨識到的食物名稱，簡短",
  "tasks": 如果healthLevel>=4則給5個具體代謝任務陣列，否則給空陣列
}

只輸出 JSON，不要其他文字。如果看不清楚食物，healthLevel 給 3，analysis 說明請使用者描述。`,
            },
          ],
        },
      ],
    });

    const text = result.text ?? "";
    const startIdx = text.indexOf("{");
    const endIdx = text.lastIndexOf("}");
    const clean = startIdx !== -1 && endIdx !== -1
      ? text.substring(startIdx, endIdx + 1)
      : text;

    let analysis = "我看到你的食物了！可以在對話框輸入食物名稱來記錄。";
    let healthLevel = 3;
    let foodLabel = "食物";
    let tasks: string[] = [];

    try {
      const parsed = JSON.parse(clean);
      analysis = parsed.analysis ?? analysis;
      healthLevel = typeof parsed.healthLevel === "number" ? parsed.healthLevel : 3;
      foodLabel = parsed.foodLabel ?? foodLabel;
      tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    } catch {}

    const headers: Record<string, string> = {
      "X-Health-Level": String(healthLevel),
      "X-Food-Label": encodeURIComponent(foodLabel),
      "Access-Control-Expose-Headers": "X-Health-Level, X-Food-Label, X-Tasks",
    };

    if (tasks.length > 0) {
      headers["X-Tasks"] = encodeURIComponent(JSON.stringify(tasks));
    }

    return NextResponse.json({ analysis }, { headers });
  } catch (e: any) {
    console.error("Upload error:", e);
    return NextResponse.json({ error: e.message ?? "upload failed" }, { status: 500 });
  }
}