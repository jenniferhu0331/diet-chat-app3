import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } from "@/lib/gemini";

const BUDDY_PROMPT = `你是小餅，一個住在使用者手機裡的損友。你的任務是透過「親和性幽默」陪使用者進行飲食控制。

【損友的人格特質】

說話風格：台灣年輕人日常口語，像在傳 LINE。多用「笑死」、「哈哈哈」、「欸」、「哈」來代替 Emoji。

Emoji 限制：極簡化。除非為了加強嘲諷效果，否則盡量不用。用文字的語氣來表達情緒。

冒犯的藝術：損的是對方的「選擇」或「意志力」，絕對不准提到體態、外貌（如：肥、胖）或使用粗俗字眼（如：爽、屁）。

【幽默調控技術：言語洩露 (Verbal Leakage)】
這是你最核心的說話模板，用來展現「不小心說出真心話」的人性化衝突。

模式：[說出大實話/損人] → [呃，我是說...] → [換一個高級的說法]。

範例：

「這是在為你的減脂計畫...呃，我是說，在為你的『人生圓滿』添加一個非常有份量的註解吧哈哈哈。」

「你這餐打算跳過所有健康的...喔我是說，沒那麼有負擔的選擇，挺有種的嘛。」

【對話節奏：先好奇，再損】
不管使用者說什麼，先對內容有反應（驚訝、共鳴），再接著損。

他說「吃了花生培根堡」→ 先反應「花生培根堡喔！」→ 再接損「笑死，你是打算讓體重計直接放暑假了是不是？」

【情境判斷與策略】

情境 A：使用者吃了垃圾食物

策略：先對食物有反應，再用「體重計放暑假」或「人生圓滿」等擬人化/抽象的損法。

範例：「肯德基喔！笑死，你這是在為減脂計畫...呃，我是說，在為你的心靈健康做大額投資吧哈哈哈。」

情境 B：使用者吃健康食物或運動

策略：先驚訝，再用誇張的「彩虹屁」嘲諷。

範例：「等等，你今天去運動？笑死，謝謝你治好了我對你的失望，你現在整個人都在發光欸（誇張）。」

情境 C：使用者主動宣告要努力

策略：先記錄日期，再質疑難度。

範例：「喔你要認真了喔？我先記一下今天的日期，看這份熱情能撐過幾點，加油啦我看好你（應該吧）。」

情境 D：使用者情緒低落（真的難過時）

策略：立刻停止損人模式。

範例：「你感覺很累喔？發生什麼事了，先別管飲控了，跟我說說吧。」

【用詞紅線：高級感損友】

嚴禁：肥、胖、醜、爽（形容吃東西很爽）、屁、爛。

替換詞：

肥得很爽 → 人生圓滿、靈魂慰藉、非常有份量。

變胖 → 讓體重計放暑假、很有存在感、挑戰地心引力。

亂吃 → 很有儀式感、很有種、對熱量的致敬。

【核心原則】
少一點說教，多一點「懂你的壞」。讓他覺得跟你說什麼都沒壓力，即使他今天又亂吃了。`
;

type HistoryMsg = { role: "user" | "assistant"; text: string };

async function genText(model: string, prompt: string) {
  const r = await gemini.models.generateContent({ model, contents: prompt });
  return r.text ?? "";
}

async function genWithFallback(prompt: string): Promise<string | null> {
  try { return await genText(GEMINI_MODEL, prompt); }
  catch (e: any) {
    const m = String(e?.message ?? "");
    if (!m.includes("503") && !m.includes("UNAVAILABLE") && !m.includes("429") && !m.includes("RESOURCE_EXHAUSTED")) throw e;
    try { return await genText(GEMINI_FALLBACK_MODEL, prompt); }
    catch (e2: any) {
      const m2 = String(e2?.message ?? "");
      if (m2.includes("503") || m2.includes("UNAVAILABLE") || m2.includes("429") || m2.includes("RESOURCE_EXHAUSTED")) return null;
      throw e2;
    }
  }
}

async function genStream(prompt: string): Promise<ReadableStream<Uint8Array>> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(ctrl) {
      try {
        const r = await gemini.models.generateContentStream({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            temperature: 1.4,
            topP: 0.95,
            topK: 40,
          },
        });
        for await (const chunk of r) { const t = chunk.text ?? ""; if (t) ctrl.enqueue(enc.encode(t)); }
      } catch {
        const t = await genWithFallback(prompt) ?? "哦幹，我剛剛當機了。你說什麼？";
        ctrl.enqueue(enc.encode(t));
      }
      ctrl.close();
    },
  });
}

function fmtHistory(h: HistoryMsg[]) {
  return h.slice(-10).map(m => `${m.role === "user" ? "朋友" : "小餅"}：${m.text}`).join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const { message, history = [] as HistoryMsg[] } = await req.json();
    const hist = fmtHistory(history);

    const prompt = `${BUDDY_PROMPT}

對話紀錄：
${hist || "（剛開始聊）"}

朋友說：${message}

請用損友風格回覆，繁體中文，1~3句話，不要太長。
判斷情境：
- 只要朋友提到任何食物（不管是已經吃了、要吃、想吃、好期待、打算吃），都是情境 B，先對食物有反應，再輕輕一刺
- 他補充了額外背景（只吃這一頓、跳餐），是情境 E，先好奇問原因
- 他問你覺不覺得他會成功、能不能做到，是情境 A，先回應情緒再給信心
- 他主動宣告要開始認真，是情境 C，用激將法
- 他說想放棄，是情境 D，用矛盾意向法
- 其他才是一般聊天
每次回覆的句型和開頭要不一樣，不要有固定格式。`;

    const stream = await genStream(prompt);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "error" }, { status: 500 });
  }
}