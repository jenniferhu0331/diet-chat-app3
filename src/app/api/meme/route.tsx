import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL } from "@/lib/gemini";
import { ImageResponse } from "@vercel/og";

export const runtime = "edge";

const BG_IMAGES = [
  { url: "https://api.memegen.link/images/fry/_.png",       mood: "懷疑、不確定" },
  { url: "https://api.memegen.link/images/rollsafe/_.png",  mood: "自以為聰明的歪理邏輯" },
  { url: "https://api.memegen.link/images/ams/_.png",       mood: "尷尬、搞砸某件事" },
  { url: "https://api.memegen.link/images/fine/_.png",      mood: "明明很糟卻說沒事" },
  { url: "https://api.memegen.link/images/waiting/_.png",   mood: "等了很久還是沒發生" },
  { url: "https://api.memegen.link/images/bad/_.png",       mood: "你真的很糟糕" },
  { url: "https://api.memegen.link/images/balloon/_.png",   mood: "逃避某件事" },
  { url: "https://api.memegen.link/images/bike-fall/_.png", mood: "自己害自己、搞砸計畫" },
  { url: "https://api.memegen.link/images/ds/_.png",        mood: "拒絕健康、接受垃圾食物" },
  { url: "https://api.memegen.link/images/buzz/_.png",      mood: "到處都是誘惑食物" },
] as const;

async function generateTexts(trigger: string, context: string, mood: string) {
  const triggerMap: Record<string, string> = {
    random:        "不定時傳給在減肥朋友的損友梗圖",
    after_cheat:   "朋友剛吃了垃圾食物，要虧他",
    morning:       "早上虧朋友又說要節食但做不到",
    evening:       "晚上問朋友今天吃了什麼垃圾",
    after_healthy: "朋友難得吃健康食物，誇張稱讚",
  };

  const prompt = `你是台灣的損友，要傳減肥梗圖給朋友。
情境：${triggerMap[trigger] ?? triggerMap["random"]}
${context ? `補充：${context}` : ""}
底圖情緒：${mood}

請生成梗圖的上下兩行文字：
1. 一定要跟減肥、飲食、垃圾食物、懶得動、體重有關
2. 繁體中文台灣口語，每行不超過10個字
3. 要有梗，讓人看了想笑

只輸出 JSON：
{
  "topText": "上方文字（10字內）",
  "bottomText": "下方文字（10字內）",
  "caption": "傳梗圖時附的一句損友話，很短"
}`;

  const result = await gemini.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
  const raw = result.text ?? "";
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(raw.substring(start, end + 1)) as {
    topText: string;
    bottomText: string;
    caption: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const { trigger = "random", context = "" } = await req.json();

    const bg = BG_IMAGES[Math.floor(Math.random() * BG_IMAGES.length)];
    const { topText, bottomText, caption } = await generateTexts(trigger, context, bg.mood);

    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px",
            position: "relative",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bg.url}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
            alt=""
          />
          <div style={{
            display: "flex",
            zIndex: 1,
            fontSize: 52,
            fontWeight: 900,
            color: "white",
            textShadow: "3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000",
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: "90%",
          }}>
            {topText}
          </div>
          <div style={{
            display: "flex",
            zIndex: 1,
            fontSize: 52,
            fontWeight: 900,
            color: "white",
            textShadow: "3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000",
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: "90%",
          }}>
            {bottomText}
          </div>
        </div>
      ),
      { width: 600, height: 600 }
    );

    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;

    return NextResponse.json({ memeUrl: dataUrl, caption, topText, bottomText });

  } catch (e: any) {
    console.error("Meme error:", e.message);
    return NextResponse.json({ memeUrl: null, caption: "梗圖生成失敗，但你懂的" });
  }
}