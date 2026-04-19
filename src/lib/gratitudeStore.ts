// src/lib/gratitudeStore.ts

export interface GratitudeEntry {
  id: string;
  date: string; // YYYY-MM-DD
  items: [string, string, string]; // 三件小事
  createdAt: string;
}

const KEY = "diet-gratitude-log";
const EVENT = "gratitude-updated";

export function getGratitudeLog(): GratitudeEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as GratitudeEntry[];
  } catch {}
  return [];
}

export function getTodayGratitude(): GratitudeEntry | null {
  const today = new Date().toISOString().slice(0, 10);
  return getGratitudeLog().find((e) => e.date === today) ?? null;
}

export function saveGratitude(items: [string, string, string]): GratitudeEntry {
  const today = new Date().toISOString().slice(0, 10);
  const log = getGratitudeLog().filter((e) => e.date !== today); // replace today's
  const entry: GratitudeEntry = {
    id: crypto.randomUUID(),
    date: today,
    items,
    createdAt: new Date().toISOString(),
  };
  log.push(entry);
  localStorage.setItem(KEY, JSON.stringify(log));
  window.dispatchEvent(new Event(EVENT));
  return entry;
}

export function onGratitudeChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}