// src/lib/mealReminder.ts
// 損友不定時訊息 + 梗圖排程

export type BuddyMessageType = "morning" | "lunch" | "dinner" | "random" | "meme";

const BUDDY_MESSAGES = {
  morning: [
    "欸你起床了嗎，今天早餐吃什麼？不要說你要跳過早餐喔，聽說跳過早餐會更胖",
    "早安！今天要繼續跟昨天一樣嗎 😏",
    "你醒了嗎。昨天說要今天開始認真的那個人",
    "ㄟ早安，今天第一餐吃什麼？讓我猜猜看，應該不是燕麥吧",
  ],
  lunch: [
    "欸午餐吃什麼？說說看，我不會評論的（才怪）",
    "午餐時間了！你是要點那個套餐還是... 那個套餐",
    "欸阿你最近飲控怎麼樣？說真的",
    "ㄟ吃飯了嗎，還是又在省這一餐",
  ],
  dinner: [
    "晚餐！今天的最後一場了，吃了什麼說來聽聽",
    "欸你晚餐吃什麼，不要說你不吃晚餐喔那個很傷身體的",
    "今天整體來說怎樣，有沒有比昨天好一點點",
    "晚安前最後一次問你，今天吃了什麼 👀",
  ],
  random: [
    "欸你是不是三天沒喝珍奶了，你這樣不行我們應該來喝一杯",
    "你變瘦我會心疼欸寶寶嗚嗚",
    "ㄟ我剛夢到你在跑步，醒來嚇了一跳",
    "你有沒有在想我，我有在想你的體重",
    "欸今天有沒有比昨天好？說謊的話我看得出來",
    "我剛看到你愛吃的那家在打折，你還說你在飲控 👁️",

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
