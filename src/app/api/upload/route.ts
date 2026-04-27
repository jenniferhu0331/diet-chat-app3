import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "no file" }, { status: 400 });

    // 轉成 base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";

    const result = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
            {
              text: `你是 BuddyBite 的營養諮詢師「小餅」。請分析這張照片中的食物。

請用繁體中文回應，格式如下（嚴格分段，段落間加兩個換行）：

第一段：描述你看到的食物是什麼，以及大致的熱量範圍。
第二段：從營養學角度給予一句簡短的客觀評估。
第三段：告訴使用者可以直接把這個食物輸入對話框來記錄。

保持簡短，每段不超過兩句話。如果照片看不清楚食物，請告知並請使用者描述。`,
            },
          ],
        },
      ],
    });

    const analysis = result.text ?? "我看到你的食物了！可以把它輸入對話框來記錄。";
    return NextResponse.json({ analysis });
  } catch (e: any) {
    console.error("Upload error:", e);
    return NextResponse.json({ error: e.message ?? "upload failed" }, { status: 500 });
  }
}