// src/lib/animalStore.ts

export interface AnimalStage {
  stage: 0 | 1 | 2 | 3 | 4; // 0=蛋 1=破殼 2=幼體 3=成體 4=完全體
  emoji: string;
  label: string;
}

export interface AnimalDef {
  id: string;
  name: string;
  stages: [string, string, string, string, string]; // emoji for each stage
  color: string; // theme color
}

export interface HatchedAnimal {
  id: string;
  defId: string;
  name: string;
  stage: 0 | 1 | 2 | 3 | 4;
  hatchedAt: string; // ISO
  completedAt?: string; // ISO, when reached stage 4
  weekKey: string; // e.g. "2026-W15"
}

export interface ZooState {
  animals: HatchedAnimal[];
  currentEggId: string | null; // currently incubating
  weekProgress: Record<string, number>; // weekKey -> % achieved (0-100)
}

// ── Animal definitions ────────────────────────────────────────────────────────
export const ANIMAL_DEFS: AnimalDef[] = [
  { id: "red-panda",  name: "小熊貓",  stages: ["🥚", "🐣", "🦝", "🐼", "🌟🐼"], color: "#e8956a" },
  { id: "shiba",      name: "柴犬",    stages: ["🥚", "🐣", "🐾", "🐕", "🦊"],   color: "#f0b860" },
  { id: "penguin",    name: "企鵝",    stages: ["🥚", "🐣", "🐾", "🐧", "👑🐧"], color: "#60b8f0" },
  { id: "hamster",    name: "倉鼠",    stages: ["🥚", "🐣", "🐾", "🐹", "✨🐹"], color: "#f0a080" },
  { id: "otter",      name: "水獺",    stages: ["🥚", "🐣", "🐾", "🦦", "🌟🦦"], color: "#60c8a0" },
  { id: "dragon",     name: "龍",      stages: ["🥚", "🐣", "🐾", "🐲", "🐉"],   color: "#9a7ad8" },
  { id: "unicorn",    name: "獨角獸",  stages: ["🥚", "🐣", "🐾", "🦄", "✨🦄"], color: "#e090d8" },
  { id: "owl",        name: "貓頭鷹",  stages: ["🥚", "🐣", "🐾", "🦉", "🌙🦉"], color: "#8090c8" },
];

const ZOO_KEY = "diet-zoo-state";

// ── Week key ──────────────────────────────────────────────────────────────────
export function getWeekKey(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ── Load / Save ───────────────────────────────────────────────────────────────
export function getZooState(): ZooState {
  try {
    const raw = localStorage.getItem(ZOO_KEY);
    if (raw) {
      const state = JSON.parse(raw) as ZooState;
      // 確保本週有一隻蛋
      ensureCurrentWeekAnimal(state);
      return state;
    }
  } catch {}
  // 第一次使用，建立初始動物
  const initial: ZooState = { animals: [], currentEggId: null, weekProgress: {} };
  ensureCurrentWeekAnimal(initial);
  return initial;
}

function ensureCurrentWeekAnimal(state: ZooState): void {
  const weekKey = getWeekKey();
  const hasThisWeek = state.animals.some((a) => a.weekKey === weekKey);
  if (!hasThisWeek) {
    const def = pickRandomDef(state.animals);
    const newAnimal: HatchedAnimal = {
      id: crypto.randomUUID(),
      defId: def.id,
      name: def.name,
      stage: 0,
      hatchedAt: new Date().toISOString(),
      weekKey,
    };
    state.animals.push(newAnimal);
    state.currentEggId = newAnimal.id;
    localStorage.setItem(ZOO_KEY, JSON.stringify(state));
  }
}

function saveZooState(state: ZooState) {
  localStorage.setItem(ZOO_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("zoo-updated"));
}

export function onZooChange(cb: () => void): () => void {
  window.addEventListener("zoo-updated", cb);
  return () => window.removeEventListener("zoo-updated", cb);
}

// ── Pick random animal def ────────────────────────────────────────────────────
function pickRandomDef(existing: HatchedAnimal[]): AnimalDef {
  // avoid repeating the last 2 animals
  const recentIds = existing.slice(-2).map((a) => a.defId);
  const pool = ANIMAL_DEFS.filter((d) => !recentIds.includes(d.id));
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Update weekly progress ────────────────────────────────────────────────────
// Call this whenever today's calorie log changes.
// pct: 0-100 (today's kcal / goal * 100)
export function updateWeekProgress(dailyPcts: number[]): void {
  // dailyPcts: array of each day's achievement % this week (0-100)
  const weekPct = dailyPcts.length > 0
    ? Math.round(dailyPcts.reduce((a, b) => a + b, 0) / 7) // average over 7 days
    : 0;

  const state = getZooState();
  const weekKey = getWeekKey();
  state.weekProgress[weekKey] = weekPct;

  // Determine animal stage from weekPct
  // 0-19% → stage 0 (蛋)
  // 20-39% → stage 1
  // 40-59% → stage 2
  // 60-79% → stage 3
  // 80-100% → stage 4 (完全體)
  const newStage = Math.min(4, Math.floor(weekPct / 20)) as 0 | 1 | 2 | 3 | 4;

  // Ensure there's a current egg for this week
  let currentAnimal = state.animals.find((a) => a.weekKey === weekKey);
  if (!currentAnimal) {
    const def = pickRandomDef(state.animals);
    currentAnimal = {
      id: crypto.randomUUID(),
      defId: def.id,
      name: def.name,
      stage: 0,
      hatchedAt: new Date().toISOString(),
      weekKey,
    };
    state.animals.push(currentAnimal);
    state.currentEggId = currentAnimal.id;
  }

  // Update stage
  if (newStage > currentAnimal.stage) {
    currentAnimal.stage = newStage;
    if (newStage === 4 && !currentAnimal.completedAt) {
      currentAnimal.completedAt = new Date().toISOString();
    }
  }

  saveZooState(state);
}

// ── Get current week's animal ─────────────────────────────────────────────────
export function getCurrentAnimal(): HatchedAnimal | null {
  const state = getZooState();
  const weekKey = getWeekKey();
  return state.animals.find((a) => a.weekKey === weekKey) ?? null;
}

export function getAnimalDef(defId: string): AnimalDef {
  return ANIMAL_DEFS.find((d) => d.id === defId) ?? ANIMAL_DEFS[0];
}

export function getAnimalEmoji(animal: HatchedAnimal): string {
  const def = getAnimalDef(animal.defId);
  return def.stages[animal.stage];
}

export function getStageName(stage: number): string {
  return ["蛋", "破殼", "幼體", "成體", "完全體"][stage] ?? "未知";
}