import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const { barcode } = await req.json();
  if (!barcode) return NextResponse.json({ error: "missing barcode" }, { status: 400 });

  // 1) 先查 Open Food Facts
  try {
    const offRes = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=product_name,nutriments,brands`,
      { headers: { "User-Agent": "DietChatApp/1.0" } }
    );
    const offData = await offRes.json();

    if (offData.status === 1 && offData.product) {
      const p = offData.product;
      const n = p.nutriments ?? {};
      const name = p.product_name || p.brands || "未知商品";

      // Open Food Facts 的數值是每 100g，這裡取每份（如果有）或預設 100g
      const servingSize = n.serving_size ? parseFloat(n.serving_size) : 100;
      const factor = isNaN(servingSize) ? 1 : servingSize / 100;

      const calories = Math.round((n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0) * factor);
      const protein  = Math.round((n.proteins_100g ?? n.proteins ?? 0) * factor * 10) / 10;
      const fat      = Math.round((n.fat_100g ?? n.fat ?? 0) * factor * 10) / 10;
      const carbs    = Math.round((n.carbohydrates_100g ?? n.carbohydrates ?? 0) * factor * 10) / 10;

      if (calories > 0 || protein > 0) {
        return NextResponse.json({
          nutrition: { name, calories, protein, fat, carbs, source: "Open Food Facts" },
        });
      }
    }
  } catch {
    // Open Food Facts 失敗，繼續往下
  }

  // 2) Open Food Facts 找不到，用 Gemini 估算
  try {
    const result = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: "user",
        parts: [{
          text: `條碼 ${barcode} 對應的台灣市售商品，請估算其營養成分。
如果你知道這個條碼對應的商品，請給出真實數據。
如果不知道，請回傳 null。
只輸出 JSON，不要其他文字：
{"name":"商品名稱","calories":數字,"protein":數字,"fat":數字,"carbs":數字}
或是不知道時輸出：null`,
        }],
      }],
    });

    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = raw.replace(/```json|```/g, "").trim();

    if (clean === "null" || !clean) {
      return NextResponse.json({ error: "找不到這個商品的資料" });
    }

    const parsed = JSON.parse(clean);
    return NextResponse.json({
      nutrition: { ...parsed, source: "AI 估算" },
    });
  } catch {
    return NextResponse.json({ error: "查詢失敗，請手動輸入" }, { status: 500 });
  }
}
