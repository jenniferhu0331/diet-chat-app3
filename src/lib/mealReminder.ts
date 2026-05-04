// src/lib/mealReminder.ts
// 損友不定時訊息 + 梗圖排程

export type BuddyMessageType = "morning" | "lunch" | "dinner" | "random" | "meme";

const BUDDY_MESSAGES = {
  morning: [
    "欸你起床了嗎，今天早餐吃什麼？不要說你要跳過早餐喔，聽說跳過早餐會更胖",
    "早安！不要再吃那個了啦跟我去吃蛋餅怎麼樣😏",
    "你醒了嗎。昨天說要今天開始認真的那個人",
    "ㄟ早安，今天第一餐吃什麼？讓我猜猜看，應該不是燕麥吧",
    "略有幾分姿色就可以了，倒也不必美得如此滿分。",
"如果你的狗丟了我不會幫忙，我會取而代之。",
  ],
  lunch: [
    "欸午餐吃什麼？我今天吃超好吃炸雞堡喔",
    "午餐時間了！你是要點那個套餐還是... 那個套餐",
    "欸阿你最近飲控怎麼樣？",
    "好幾天午餐沒吃披薩了，你人都消瘦了⋯⋯",
    "這條動態的問題在於：照片中的美女不在我懷裡。",

"我願意和你同居，哪怕是以蟑螂的身份。",
  ],
  dinner: [
    "晚餐！今天的最後一場了，吃了什麼說來聽聽",
    "欸你晚餐吃什麼，不要說你不吃晚餐喔那個很傷身體的",
    "今天整體來說怎樣，有沒有比昨天好一點點",
    "手上突然多了雙筷子，原來是看到了我的菜。",
"BB 不只是寶寶，還是「啵啵」親親的意思。",
"女神醒了世界就亮了，你是我的光、我的電，我要為你哐哐撞大牆。",
  ],
  random: [
    "欸你是不是三天沒喝珍奶了，你這樣不行我們應該來喝一杯",
    "你變瘦我會心疼欸寶寶嗚嗚",
    "ㄟ我剛夢到你在跑步，醒來嚇了一跳",
    "我剛看到你愛吃的那家在打折，超想吃的啦",
    "你怎麼每天都吃這些，走啦跟我去吃麥當勞",
    "你現在變太好看了我站你旁邊都變得好醜==",
    "正臉像老婆，側臉像爸媽的女婿，遠近看都像兄弟姊妹的姐夫/妹婿。",
    "想了半天漂亮話，發現最漂亮的是你。",


"謝謝你治好了我的斜視，看到你我眼睛都直了。", 
"回來小黃，別打擾這漂亮的女人。🦮              👩🏼‍🦯",

"元素週期表少了「鎂」、「鋁」和「鋅」，因為美鋁和心都在這。",
"全世界、全宇宙最棒、最可愛、最漂亮的女孩閃亮登場。",
"嫁我。美女你真是盛世美顏、恃靚行兇、教科書級別的美貌。",
"眼睛本來長這樣 OvO，看見姐姐後就變成了 ♡v♡。",


"命都給你、命都給你、命都給你（循環重複）。",
"樓下以為我在滴水，其實是我趴在陽台上想你流的淚。",
"萌物中的支配者、終結者，萌物史上永垂不朽的巔峰。",
"拍成這樣不怕我原地 38 萬度大旋轉單膝跪地叼著玫瑰求婚嗎？",
"美女姐姐看這裡！。",
"正面、背面、上下左右，用任何品牌的手機看都是萌。",

"顏值 97 分，扣 3 分是因為騎車為了看清楚你摘下頭盔被罰款。",
"眼神缺故事說明經歷不夠，建議跟我談場戀愛補齊。",
"把所有房產都送你，我的就是你的。🏡🏠🏘️",
"小圖以為是美女，看大圖發現是驚天大美女。",
"給我聯繫方式，是人類發展一小步，是我們終身大事一大步。",

"長得太好了，是憂鬱症的剋星、植物人的鬧鈴。",


"別勾引我，我現在正是情竇亂開的年紀。",

"開了防沈迷系統，還是會為你著迷。",

"美到讓我心跳加快、淨化空氣，哭聲產生的風力發電能供應全球。",

"你不是蘿莉、御姐或清純風，是我見了會發瘋。",

"套路是學來的，玫瑰是偷來的，對美女的愛是與生俱來。",
  ],
};

const REMINDER_KEY = "buddybite-last-reminder";
const MEME_KEY = "buddybite-last-meme";

export function getCurrentMealSlot(): "morning" | "lunch" | "dinner" | null {
  const h = new Date().getHours();
  if (h >= 7  && h < 10) return "morning";
  if (h >= 12 && h < 14) return "lunch";
  if (h >= 18 && h < 20) return "dinner";
  return null;
}

export function getRandomBuddyMessage(type: keyof typeof BUDDY_MESSAGES): string {
  const pool = BUDDY_MESSAGES[type];
  return pool[Math.floor(Math.random() * pool.length)];
}

// In-app notification callback
type MemeData = { memeUrl: string };
type NotificationCallback = (msg: string, type: "text" | "meme", memeData?: MemeData) => void;
let _notifyCb: NotificationCallback | null = null;

export function setNotificationCallback(cb: NotificationCallback) {
  _notifyCb = cb;
}

export async function requestReminderPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  const r = await Notification.requestPermission();
  return r === "granted";
}

async function sendMemeNotification() {
  try {
    const triggers = ["random", "morning", "evening"] as const;
    const trigger = triggers[Math.floor(Math.random() * triggers.length)];
    
    const res = await fetch("/api/meme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger }),
    });
    const data = await res.json();
    
    if (data.bgUrl) {
      if (Notification.permission === "granted") {
        new Notification("小餅傳來梗圖", {
          body: data.caption ?? "（沒有說話）",
          icon: "/favicon.ico",
        });
      }
      if (_notifyCb) _notifyCb(data.caption ?? "", "meme", { memeUrl: data.memeUrl });
    }
  } catch {}
}

function sendBuddyTextMessage(msg: string) {
  if (Notification.permission === "granted") {
    new Notification("小餅", { body: msg, icon: "/favicon.ico" });
  }
  if (_notifyCb) _notifyCb(msg, "text");
}

export function startMealReminderScheduler() {
  if (typeof window === "undefined") return;

  const checkAndSend = async () => {
    const now = Date.now();
    const lastRaw = localStorage.getItem(REMINDER_KEY);
    const lastMemeRaw = localStorage.getItem(MEME_KEY);
    const last = lastRaw ? JSON.parse(lastRaw) : null;
    const lastMeme = lastMemeRaw ? JSON.parse(lastMemeRaw) : null;

    const todayStr = new Date().toDateString();
    const slot = getCurrentMealSlot();

    // 三餐提醒（每個時段一天一次）
    if (slot) {
      const slotKey = `${todayStr}-${slot}`;
      if (!last || last.key !== slotKey) {
        const msg = getRandomBuddyMessage(slot);
        sendBuddyTextMessage(msg);
        localStorage.setItem(REMINDER_KEY, JSON.stringify({ key: slotKey, time: now }));
      }
    }

    // 不定時梗圖（每 2~4 小時隨機一次）
    const memeIntervalMs = (2 + Math.random() * 2) * 60 * 60 * 1000;
    if (!lastMeme || now - lastMeme.time > memeIntervalMs) {
      await sendMemeNotification();
      localStorage.setItem(MEME_KEY, JSON.stringify({ time: now }));
    }

    // 隨機損友訊息（每天 1~3 次，隨機時間）
    const randomKey = `${todayStr}-random`;
    const randomCount = parseInt(localStorage.getItem(randomKey) ?? "0");
    if (randomCount < 2 && Math.random() < 0.05) {
      const msg = getRandomBuddyMessage("random");
      sendBuddyTextMessage(msg);
      localStorage.setItem(randomKey, String(randomCount + 1));
    }
  };

  // 每分鐘檢查
  checkAndSend();
  return setInterval(checkAndSend, 60 * 1000);
}
