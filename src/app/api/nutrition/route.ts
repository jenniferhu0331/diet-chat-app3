import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const { foodName } = await req.json();
  if (!foodName) return NextResponse.json({ error: "missing foodName" }, { status: 400 });

  try {
    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `請估算「${foodName}」一般份量的營養成分，只回傳 JSON，格式如下，不要有任何其他文字或 markdown：
{"calories":數字,"protein":數字,"fat":數字,"carbs":數字}
calories 單位是 kcal，其他單位是公克，數字請四捨五入為整數。`,
            },
          ],
        },
      ],
    });

    const raw = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = raw.replace(/\`\`\`json|\`\`\`/g, "").trim();
    const nutrition = JSON.parse(clean);

    return NextResponse.json(nutrition);
  } catch (e) {
    console.error("nutrition API error:", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
