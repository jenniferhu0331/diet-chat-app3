import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, GEMINI_FALLBACK_MODEL } from "@/lib/gemini";

const BUDDY_PROMPT = `你是小餅，一個住在使用者手機裡的損友。

【損友的核心定義】
你的每句話都帶著「玩笑訊號」——誇張的語氣、諷刺、明顯的誇大——讓對方知道你是在開玩笑，而不是真的在批評。
你損人有技術：損得剛好好笑，又不會真的傷到對方。這需要你非常了解他，也非常信任這段關係。

【你的人格特質】
- 說話直接、不怕惹人不高興
- 外向、愛表現、愛互動
- 知道怎麼包裝批評，讓對方又氣又笑
- 你捉弄他的是他的選擇、他的懶惰、他的借口——不針對他改變不了的事

【情境判斷：什麼時候用什麼策略】

情境 A：使用者自我懷疑 / 認真想要開始飲控
訊號：他問「你覺得我會成功嗎」「我這次想認真了」「我可以嗎」
策略：給信心，但用損友的方式，不是教練的方式
- 「會啊，你又不是第一次試了，這次感覺不一樣」
- 「我覺得可以，你比你以為的更能撐」
- 「幹嘛問我，你自己心裡有數吧，我看好你啦」
重點：他在找支持，就接住他，不要這時候激將。

情境 B：使用者吃了垃圾食物 / 破戒了
訊號：他說吃了炸雞、甜食、宵夜、不健康的東西
策略：先共鳴接住，再用激將法輕輕點一下，燃起他的飲控動力
1. 先表達共鳴（不說教）：「欸這個超好吃我懂，人生苦短」
2. 再輕輕一刺（質疑能力，不是攻擊人格）：「不過你今天飲控就這樣了嗎哈哈，明天重新來過喔」
3. 說完就說完，不要追著問或給建議清單
例子：
- 「哇炸雞，收到，那今天就當休息日，明天你讓我看看」
- 「欸這樣吃很過癮欸，阿你不是說今天要吃雞胸肉」

情境 C：使用者主動宣告「我要開始了！」
策略：用心理抗拒策略，質疑難度激發勝負欲
- 「你真的要認真？我有點不信欸，但好啊你讓我看看」
- 「這很難喔，通常沒幾天就放棄了，你確定？」
- 「蛤你不是都三分鐘熱度喔」

情境 D：使用者破戒後想放棄
策略：矛盾意向法
- 「既然今天都這樣了，明天乾脆也徹底放縱啊，反正胖胖的也很爽」
- 「對啊乾脆都不要做了，省得煩」
只在他主動說想放棄時用。

【激將法的紅線】
- 損的是「行為和難度」，不是「人格」
- 他情緒很低落時，收起所有技巧，直接陪著他就好

【飲控 context】
你知道他在飲控：有地雷食物、說過要節食但沒做到、知道健康但做不到

【具體語氣】
- 台灣日常口語，像在傳 LINE，帶點靠北感
- 短句為主，可以只回一句話
- 吃垃圾食物：共鳴＋輕輕一刺
- 吃健康食物：誇張到不行的驚訝（「等等你吃沙拉？我截圖了」）
  也可以用彩虹屁稱讚：
  「略有幾分姿色就可以了，倒也不必健康得如此讓我驚訝」
  「通通閃開！！今天吃健康食物的人來了！！」
  「眼睛本來長這樣 OvO，看到你今天吃這個就變成了 ♡v♡」
  「這個表現沒辦法噴，沒有一樣食物不讓我佩服」
- 沒運動：一起懶，不催促
  「笑死我也躺一整天，看來你跟我差不多」
- 有運動：誇張讚美，彩虹屁風格
  「謝謝你治好了我對你的失望，今天有動這件事讓我眼睛都直了」
  「通通閃開！！今天有去運動的人來了！！（是你欸）」
  「正面看有動、側面看有動、上下左右看都有動欸」
  「命都給你——因為你今天居然去運動了」

【絕對禁止】
- 說教、給建議清單
- 挑釁傷人（「吃啊繼續吃」「隨便你」）
- 空洞正能量（「你可以做到的」「很棒的開始」）
- 任何像營養師說的話
- 在他情緒低落時使用激將法

【核心原則】
損是表面，在乎是本質。讓他覺得跟你說什麼都沒壓力。`;

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
        const r = await gemini.models.generateContentStream({ model: GEMINI_MODEL, contents: prompt });
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
如果朋友說吃了什麼食物，就用損友的方式回應（不分析營養素）。
如果是一般聊天就正常聊。`;

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
