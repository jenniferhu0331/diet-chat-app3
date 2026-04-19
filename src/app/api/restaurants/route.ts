import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildGoogleMapsLink, estimateHealthTag } from "@/lib/utils";

const bodySchema = z.object({
  query: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parsed = bodySchema.parse(json);
    const endpoint = "https://places.googleapis.com/v1/places:searchText";

    // 同時搜尋一般餐廳和便利商店
    const [restaurantRes, convenienceRes] = await Promise.all([
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.currentOpeningHours.openNow,places.location,places.types",
        },
        body: JSON.stringify({
          textQuery: `${parsed.query} 餐廳`,
          locationBias: {
            circle: {
              center: { latitude: parsed.lat, longitude: parsed.lng },
              radius: 1000.0,
            },
          },
          maxResultCount: 5,
          languageCode: "zh-TW",
        }),
      }),
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.currentOpeningHours.openNow,places.location,places.types",
        },
        body: JSON.stringify({
          textQuery: "7-11 全家 便利商店",
          locationBias: {
            circle: {
              center: { latitude: parsed.lat, longitude: parsed.lng },
              radius: 500.0,
            },
          },
          maxResultCount: 3,
          languageCode: "zh-TW",
        }),
      }),
    ]);

    const [restaurantData, convenienceData] = await Promise.all([
      restaurantRes.json(),
      convenienceRes.json(),
    ]);

    const NON_FOOD_TYPES = [
      "pharmacy", "drugstore", "hospital", "doctor", "clothing_store",
      "electronics_store", "department_store", "supermarket", "furniture_store",
      "hardware_store", "gym", "beauty_salon", "bank", "atm",
    ];

    const isRealFoodPlace = (p: any) => {
      const types: string[] = p.types ?? [];
      const name: string = p.displayName?.text ?? "";
      if (types.some((t: string) => NON_FOOD_TYPES.includes(t))) return false;
      // 排除明顯非食物店名
      const NON_FOOD_KEYWORDS = ["藥局", "藥妝", "診所", "醫院", "銀行", "保險", "眼鏡", "手機", "電信", "龍角散", "藥品"];
      if (NON_FOOD_KEYWORDS.some((kw) => name.includes(kw))) return false;
      return true;
    };

    const formatPlace = (p: any) => ({
      id: p.id,
      name: p.displayName?.text ?? "未命名店家",
      address: p.formattedAddress,
      openNow: p.currentOpeningHours?.openNow,
      rating: p.rating,
      googleMapsLink: buildGoogleMapsLink(p.displayName?.text ?? "店家", p.formattedAddress),
      healthTag: estimateHealthTag(p.displayName?.text ?? "", p.types ?? []),
      types: p.types ?? [],
      isConvenience: (p.types ?? []).includes("convenience_store") ||
        (p.displayName?.text ?? "").includes("7-11") ||
        (p.displayName?.text ?? "").includes("全家") ||
        (p.displayName?.text ?? "").includes("萊爾富") ||
        (p.displayName?.text ?? "").includes("OK"),
    });

    const restaurants = (restaurantData.places || []).map(formatPlace).filter(isRealFoodPlace);
    const conveniences = (convenienceData.places || []).map(formatPlace).filter(isRealFoodPlace);

    // 合併，便利商店放前面
    const places = [...conveniences, ...restaurants].slice(0, 6);

    return NextResponse.json({ places });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? "Unknown error" }, { status: 400 });
  }
}