import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/server/supabase";

export async function POST(req: NextRequest) {
  try {
    const { authUserId, displayId } = await req.json();

    if (!authUserId || !displayId) {
      return NextResponse.json(
        { error: "Missing authUserId or displayId" },
        { status: 400 }
      );
    }

    // 先查是否已存在
    const { data: existingByUser } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authUserId)
      .maybeSingle();

    if (existingByUser) {
      return NextResponse.json({ profile: existingByUser });
    }

    // display_id 不可重複
    const { data: existingByDisplay } = await supabase
      .from("profiles")
      .select("*")
      .eq("display_id", displayId)
      .maybeSingle();

    if (existingByDisplay) {
      return NextResponse.json(
        { error: "This display ID is already taken." },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("profiles")
      .insert({
        id: authUserId,
        display_id: displayId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Init user failed" },
      { status: 500 }
    );
  }
}