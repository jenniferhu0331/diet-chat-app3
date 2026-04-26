// src/lib/mealReminder.ts
// 早中晚提醒 + 智慧回顧

import { getAllEggs, getActiveEgg, effectivePoints } from "./eggStore";

export type MealSlot = "breakfast" | "lunch" | "dinner";

export interface ReminderPayload {
  slot: MealSlot;
  title: string;
  body: string;
}

// 判斷現在是哪個餐段
export function getCurrentMealSlot(): MealSlot | null {
  const h = new Date().getHours();
  if (h >= 7  && h < 9)  return "breakfast";
  if (h >= 12 && h < 14) return "lunch";
  if (h >= 18 && h < 20) return "dinner";
  return null;
}

// 分析近期飲食記錄，產生回顧文字
export function buildReviewMessage(): {
  praise: string | null;
  suggestion: string | null;
} {
  const egg = getActiveEgg();
  if (!egg) return { praise: null, suggestion: null };

  const records = egg.records.slice(-9); // 最近三天 × 三餐
  const healthyCount = records.filter(r => r.type === "healthy").length;
  const cheatCount   = records.filter(r => r.type === "cheat").length;
  const tipCount     = records.filter(r => r.type === "tip").length;
  const pts = effectivePoints(egg);
  const completedTasks = egg.tasks.filter(t => t.isCompleted).length;
  const totalTasks = egg.tasks.length;

  let praise: string | null = null;
  let suggestion: string | null = null;

  // 稱讚邏輯
  if (healthyCount >= 2) {
    praise = `最近有 ${healthyCount} 次健康飲食的記錄，這讓蛋的孵化進度推進了不少。`;
  } else if (tipCount >= 1) {
    praise = `你有在用降低傷害的小方法，這種覺察很值得肯定。`;
  } else if (completedTasks > 0) {
    praise = `代謝任務完成了 ${completedTasks}/${totalTasks} 個，執行力很好。`;
  }

  // 建議邏輯（只在真的有問題時說）
  if (cheatCount >= 3 && healthyCount === 0) {
    suggestion = `最近幾餐比較重口味，下一餐可以考慮補充蔬菜或蛋白質讓身體平衡一下。`;
  } else if (totalTasks > 0 && completedTasks === 0) {
    suggestion = `代謝任務還沒開始，完成任務會讓蛋掉落孵化素材喔。`;
  } else if (egg.penaltyDays > 3) {
    suggestion = `目前累積了 ${egg.penaltyDays.toFixed(1)} 天的延遲，多記錄幾次健康餐可以慢慢補回來。`;
  }

  return { praise, suggestion };
}

// 產生提醒內容
export function buildReminderPayload(slot: MealSlot): ReminderPayload {
  const { praise, suggestion } = buildReviewMessage();
  const egg = getActiveEgg();
  const pts = egg ? Math.round(effectivePoints(egg)) : 0;

  const slotLabel: Record<MealSlot, string> = {
    breakfast: "早餐",
    lunch: "午餐",
    dinner: "晚餐",
  };

  const greetings: Record<MealSlot, string> = {
    breakfast: "早安！該吃早餐了",
    lunch: "午安，午餐時間到了",
    dinner: "晚上好，記得吃晚餐",
  };

  let body = greetings[slot];
  if (egg) body += `（蛋目前 ${pts}%）`;
  body += "。";
  if (praise) body += ` ${praise}`;
  if (suggestion) body += ` ${suggestion}`;
  if (!praise && !suggestion) body += " 記錄今天的飲食，讓蛋繼續孵化。";

  return {
    slot,
    title: `🥚 ${slotLabel[slot]}提醒`,
    body,
  };
}

// 啟動排程（每分鐘檢查一次，避免重複推播用 localStorage 記錄）
const REMINDER_KEY = "buddybite-last-reminder";

export function startMealReminderScheduler() {
  if (typeof window === "undefined") return;

  const check = () => {
    const slot = getCurrentMealSlot();
    if (!slot) return;

    // 同一個餐段今天只推一次
    const lastRaw = localStorage.getItem(REMINDER_KEY);
    const last = lastRaw ? JSON.parse(lastRaw) : null;
    const todaySlotKey = `${new Date().toDateString()}-${slot}`;
    if (last?.key === todaySlotKey) return;

    // 推播通知
    if (Notification.permission === "granted") {
      const payload = buildReminderPayload(slot);
      new Notification(payload.title, { body: payload.body, icon: "/favicon.ico" });
      localStorage.setItem(REMINDER_KEY, JSON.stringify({ key: todaySlotKey }));
    }
  };

  // 先檢查一次，再每分鐘跑
  check();
  return setInterval(check, 60 * 1000);
}

export async function requestReminderPermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  const result = await Notification.requestPermission();
  return result === "granted";
}