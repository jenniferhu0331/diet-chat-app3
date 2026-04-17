import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `uploads/${uuidv4()}.${ext}`;

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

    const base64 = buffer.toString("base64");

    const result = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          inlineData: {
            mimeType: file.type,
            data: base64,
          },
        },
        `請用繁體中文簡短描述這張照片是不是食物照。
如果是，請盡量判斷：
1. 可能是什麼食物
2. 大概屬於主食/炸物/飲料/甜點/蔬菜/蛋白質哪一類
3. 不要過度自信，如果不確定請明說`
      ],
    });

    return NextResponse.json({
      imageUrl: publicUrlData.publicUrl,
      analysis: result.text ?? "",
      path: filePath,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}