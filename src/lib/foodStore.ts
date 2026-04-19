// src/lib/foodStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight cross-page food log using localStorage + custom events.
// Works with Next.js App Router (client components only).
// ─────────────────────────────────────────────────────────────────────────────

export interface FoodEntry {
  id: string;
  name: string;          // e.g. "滷肉飯"
  meal: "早餐" | "午餐" | "晚餐" | "點心";
  calories?: number;
  protein?: number;      // grams
  fat?: number;          // grams
  carbs?: number;        // grams
  note?: string;         // extra context extracted from chat
  addedAt: string;       // ISO string
  source: "chat" | "manual";
}

const STORAGE_KEY = "diet-food-log";
const EVENT_NAME = "diet-food-log-updated";

// ── Read ──────────────────────────────────────────────────────────────────────
export function getFoodLog(): FoodEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as FoodEntry[]) : [];
  } catch {
    return [];
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────
export function addFoodEntry(entry: Omit<FoodEntry, "id" | "addedAt">, customTime?: string): FoodEntry {
  const full: FoodEntry = {
    ...entry,
    id: crypto.randomUUID(),
    addedAt: customTime ?? new Date().toISOString(),
  };
  const log = getFoodLog();
  log.push(full);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  window.dispatchEvent(new Event(EVENT_NAME));
  return full;
}

export function removeFoodEntry(id: string): void {
  const log = getFoodLog().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function clearFoodLog(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(EVENT_NAME));
}

// ── Subscribe ─────────────────────────────────────────────────────────────────
export function onFoodLogChange(cb: () => void): () => void {
  window.addEventListener(EVENT_NAME, cb);
  return () => window.removeEventListener(EVENT_NAME, cb);
}

// ── AI extraction helper ──────────────────────────────────────────────────────
// Call this with the full assistant message text.
// Returns an array of food names it detected (simple heuristic version).
// In the chat page you can replace this with a real Claude API call.
export function extractFoodsFromText(text: string): string[] {
  // Very naive: look for common patterns like 「吃了X」「點了X」「喝了X」
  const patterns = [
    /(?:吃了?|點了?|喝了?|來了?|有吃?|吃過?)[一了]?[\s]*([^\s,，。！？、]+)/g,
  ];
  const found = new Set<string>();
  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const candidate = m[1].replace(/[了嗎呢啊喔唷哦！？。，、\s]/g, "").trim();
      if (candidate.length >= 2 && candidate.length <= 12) {
        found.add(candidate);
      }
    }
  }
  return [...found];
}

// ── Daily summary ─────────────────────────────────────────────────────────────
export interface DailySummary {
  totalCalories: number;
  totalProtein: number;
  totalFat: number;
  totalCarbs: number;
  entries: FoodEntry[];
}

export function getTodaySummary(): DailySummary {
  const today = new Date().toDateString();
  const entries = getFoodLog().filter(
    (e) => new Date(e.addedAt).toDateString() === today
  );
  return {
    totalCalories: entries.reduce((s, e) => s + (e.calories ?? 0), 0),
    totalProtein: entries.reduce((s, e) => s + (e.protein ?? 0), 0),
    totalFat: entries.reduce((s, e) => s + (e.fat ?? 0), 0),
    totalCarbs: entries.reduce((s, e) => s + (e.carbs ?? 0), 0),
    entries,
  };
}