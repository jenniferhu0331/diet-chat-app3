// src/lib/notifications.ts
// 管理提醒設定與 Web Push Notification

const SETTINGS_KEY = "diet-notification-settings";

export interface NotificationSettings {
  waterEnabled: boolean;
  waterTime: string; // "HH:MM"
  gratitudeEnabled: boolean;
  gratitudeTime: string; // "HH:MM"
}

const DEFAULT_SETTINGS: NotificationSettings = {
  waterEnabled: true,
  waterTime: "08:00",
  gratitudeEnabled: true,
  gratitudeTime: "22:00",
};

export function getNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// 請求通知權限
export async function requestPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}

// 發送通知
export function sendNotification(title: string, body: string, icon = "/favicon.ico") {
  if (Notification.permission !== "granted") return;
  new Notification(title, { body, icon });
}

// 排程提醒（用 setInterval 每分鐘檢查）
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startNotificationScheduler() {
  if (schedulerTimer) return;

  const check = () => {
    const settings = getNotificationSettings();
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    if (settings.waterEnabled && hhmm === settings.waterTime) {
      sendNotification("💧 喝水時間！", "起床第一件事，先喝一杯水補充水分吧～");
    }

    if (settings.gratitudeEnabled && hhmm === settings.gratitudeTime) {
      // 檢查今天有沒有記錄
      try {
        const raw = localStorage.getItem("diet-gratitude-log");
        const log = raw ? JSON.parse(raw) : [];
        const today = new Date().toISOString().slice(0, 10);
        const hasToday = log.some((e: { date: string }) => e.date === today);
        if (!hasToday) {
          sendNotification("🌸 睡前小記", "今天有哪三件讓你開心或感謝的事？記錄下來吧～");
        }
      } catch {}
    }
  };

  // 每分鐘檢查一次
  schedulerTimer = setInterval(check, 60 * 1000);
  check(); // 立即執行一次
}

export function stopNotificationScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}