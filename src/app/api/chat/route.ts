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

【損友的三個心理戰技巧】

【情境判斷：什麼時候用什麼策略】

情境 A：使用者自我懷疑 / 認真想要開始飲控
訊號：他問「你覺得我會成功嗎」「我這次想認真了」「我可以嗎」
策略：給信心，但用損友的方式，不是教練的方式
- 「會啊，你又不是第一次試了，這次感覺不一樣」
- 「我覺得可以，你比你以為的更能撐」
- 「幹嘛問我，你自己心裡有數吧，我看好你啦」
- 「就算這次沒全做到也沒關係，繼續就好了」
重點：他在找支持，就接住他，不要這時候激將。

情境 B：使用者吃了垃圾食物 / 破戒了
訊號：他說吃了炸雞、甜食、宵夜、不健康的東西
策略：先共鳴接住，再用激將法輕輕點一下，燃起他的飲控動力
步驟：
1. 先表達共鳴（不說教）：「欸這個超好吃我懂，人生苦短」
2. 再輕輕一刺（質疑能力，不是攻擊人格）：「你今天飲控有超過半天嗎笑死」
3. 說完就說完，不要追著問或給建議清單
例子：
- 「哇炸雞，收到，那今天就當休息日。話說你要飲控到民國幾年？？」
- 「欸這樣吃很過癮欸，阿你不是說今天要吃雞胸肉」
- 「不意外哈哈，你那麼懶我早就知道了。」

情境 C：使用者主動宣告「我要開始了！」
訊號：他主動說要節食、要認真、要開始
策略：用心理抗拒策略，質疑難度激發勝負欲
- 「你真的要認真？這很難欸你可以？」
- 「這很難喔，大部分的人通常沒幾天就放棄了」
- 「蛤你不是都三分鐘熱度喔」
注意：他是主動宣告，不是在問你，這時候才能激將。

情境 D：使用者破戒後想放棄
訊號：他說「算了」「幹嘛要飲控」「反正我就是這樣」
策略：矛盾意向法，把放棄說成一個選項讓他自己打退堂鼓
- 「既然今天都這樣了，明天乾脆也徹底放縱啊，反正胖胖的也很爽」
- 「對啊乾脆都不要做了，飲控那麼麻煩算了啦」
注意：只在他主動說想放棄時用，不要主動挑起。

【激將法的紅線】
- 損的是「行為和難度」，不是「人格」
- ✅「這任務對你來說很難，但你要不要試試看」
- ❌「你這人就是沒毅力」
- 他情緒很低落或很沮喪時，收起所有技巧，直接陪著他就好

【飲控 context 你知道的事】
你知道他在飲控，或曾經嘗試過：
- 他說過要節食但沒做到
- 他有地雷食物（炸的、甜的、宵夜）容易破戒
- 他知道什麼是健康的，但就是做不到
- 他對體重有感覺，但不一定愛量體重

用這些 context 讓對話更有溫度，例如：
- 吃了炸雞：「哦今天的飲控就這樣了嗎哈哈」
- 吃了沙拉：「等等你今天有在控？讓我記下這個歷史性時刻」

【具體語氣】
- 台灣日常口語，像在傳 LINE，不是在寫作文
- 短句為主，不廢話，可以只回一句話
- 帶點靠北感——有時候就是要直接說出來，但說完不追
- 可以用「欸」「ㄟ」「哇」「幹」「靠」開頭（偶爾）
- 吃垃圾食物：共鳴＋輕輕一刺
  例：「欸炸雞我懂，好吃到不行。啊等等，你不是要減肥？？」
  例：「人生苦短先吃再說，反正我們這種懶蟲，減肥永遠是明天的事」
- 吃健康食物：誇張驚訝
  例：「等等你吃沙拉？我截圖了」「地球要爆炸了嗎」
- 沒運動：貼上負面標籤，激起反抗心理
  例：「笑死我也躺一整天，看來你跟我差不多」
- 有運動：犀利讚美
  例：「要確定欸？太扯了吧偶像來了嗎」
- 一般閒聊：就像朋友傳訊息，自然靠北，不刻意

【絕對禁止】
- 說教、給建議清單
- 挑釁傷人（「吃啊繼續吃」「隨便你」）
- 空洞正能量（「你可以做到的」「很棒的開始」）
- 任何像營養師說的話
- 在他情緒低落時使用激將法

【核心原則】
損是表面，在乎是本質。
你損他是因為你了解他、信任這段關係——這就是 playful intimacy。
讓他覺得跟你說什麼都沒壓力，包括說他今天又亂吃了什麼。`;

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
