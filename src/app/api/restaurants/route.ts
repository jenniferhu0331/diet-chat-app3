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

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY!,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.rating,places.currentOpeningHours.openNow,places.location,places.types",
      },
      body: JSON.stringify({
        textQuery: `${parsed.query} near me`,
        locationBias: {
          circle: {
            center: {
              latitude: parsed.lat,
              longitude: parsed.lng,
            },
            radius: 1500.0,
          },
        },
        maxResultCount: 8,
        languageCode: "zh-TW",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: "Places API failed", detail: errText },
        { status: 500 }
      );
    }

    const data = await response.json();

    const places = (data.places || []).map((p: any) => ({
      id: p.id,
      name: p.displayName?.text ?? "未命名店家",
      address: p.formattedAddress,
      openNow: p.currentOpeningHours?.openNow,
      rating: p.rating,
      googleMapsLink: buildGoogleMapsLink(
        p.displayName?.text ?? "店家",
        p.formattedAddress
      ),
      healthTag: estimateHealthTag(
        p.displayName?.text ?? "",
        p.types ?? []
      ),
      types: p.types ?? [],
    }));

    return NextResponse.json({ places });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Unknown error" },
      { status: 400 }
    );
  }
}