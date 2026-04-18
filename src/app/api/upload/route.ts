import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/server/supabase";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";
import { v4 as uuidv4 } from "uuid";

function safeParseJson(text: string) {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userId = formData.get("userId") as string | null;
    const mealType = (formData.get("mealType") as string | null) || "snack";

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `${userId}/uploads/${uuidv4()}.${ext}`;

    // 1) 上傳到 Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("meal-photos")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("meal-photos")
      .getPublicUrl(filePath);

    const imageUrl = publicUrlData.publicUrl;
    const base64 = buffer.toString("base64");

    // 2) 保留你原本的中文分析風格，但改成同時回 JSON
    const result = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          inlineData: {
            mimeType: file.type,
            data: base64,
          },
        },
        `請分析這張圖片，並只回傳 JSON，不要加其他說明。

JSON 格式如下：
{
  "is_food": true,
  "food": "可能的食物名稱",
  "category": "主食/炸物/飲料/甜點/蔬菜/蛋白質/其他",
  "estimated_calories": 0,
  "protein_g": 0,
  "carb_g": 0,
  "fat_g": 0,
  "fiber_g": 0,
  "sugar_g": 0,
  "sodium_mg": 0,
  "confidence": "low/medium/high",
  "friendly_summary": "請用繁體中文、自然口吻，簡短描述這張圖是不是食物照，以及大概是什麼"
}

規則：
1. 如果不是食物照，請把 is_food 設為 false
2. 若不確定，請降低 confidence，不要過度自信
3. estimated_calories 和各營養素可為粗估值
4. friendly_summary 要自然、簡短、繁體中文`
      ],
    });

    const rawText = result.text ?? "";
    const parsed = safeParseJson(rawText);

    // 3) 如果 Gemini 沒回成功 JSON，就至少保留一個分析文字
    if (!parsed) {
      return NextResponse.json({
        imageUrl,
        analysis: rawText || "我有收到圖片，但暫時沒辦法穩定分析。",
        path: filePath,
      });
    }

    // 4) 寫進 meal_entries（只有食物照才寫）
    if (parsed.is_food) {
      const { error: insertError } = await supabase.from("meal_entries").insert({
        user_id: userId,
        meal_type: mealType, // breakfast / lunch / dinner / snack
        source_type: "image",
        description: parsed.food || "unknown food",
        image_path: filePath,
        image_url: imageUrl,
        estimated_calories: parsed.estimated_calories ?? 0,
        protein_g: parsed.protein_g ?? 0,
        carb_g: parsed.carb_g ?? 0,
        fat_g: parsed.fat_g ?? 0,
        fiber_g: parsed.fiber_g ?? 0,
        sugar_g: parsed.sugar_g ?? 0,
        sodium_mg: parsed.sodium_mg ?? 0,
        confidence: parsed.confidence ?? "low",
        analysis_note: parsed.friendly_summary ?? "",
      });

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      imageUrl,
      analysis:
        parsed.friendly_summary ??
        (parsed.is_food
          ? `這看起來像 ${parsed.food || "某種食物"}。`
          : "這張看起來不像典型的食物照。"),
      path: filePath,
      nutrition: {
        is_food: parsed.is_food,
        food: parsed.food,
        category: parsed.category,
        estimated_calories: parsed.estimated_calories,
        protein_g: parsed.protein_g,
        carb_g: parsed.carb_g,
        fat_g: parsed.fat_g,
        fiber_g: parsed.fiber_g,
        sugar_g: parsed.sugar_g,
        sodium_mg: parsed.sodium_mg,
        confidence: parsed.confidence,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}