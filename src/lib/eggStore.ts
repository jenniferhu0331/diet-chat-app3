// src/lib/eggStore.ts
export type MealType = "healthy" | "cheat" | "tip";

export interface EggTask {
  id: string;
  description: string;
  isCompleted: boolean;
}

export interface EggRecord {
  id: string;
  type: MealType;
  note: string;
  addedAt: string;
  pointsDelta: number;
  penaltyDelta: number;
}

export interface Egg {
  id: string;
  defId: string;
  createdAt: string;
  hatchPoints: number;   // 0–100，唯一的孵化進度來源
  penaltyDays: number;
  stage: 0 | 1 | 2 | 3 | 4;
  completedAt?: string;
  records: EggRecord[];
  pausedAt?: string;
  tasks: EggTask[];
}

export interface EggStoreState {
  eggs: Egg[];
  activeEggId: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────
export const POINTS_PER_HEALTHY_MEAL = 34;  // 三餐健康 ≈ 102pt → 孵化完成
export const PENALTY_CHEAT = 2;
export const PENALTY_TIP_REDUCTION = 0.2;
export const POINTS_PER_PENALTY_DAY = 34 / 3;
export const MAX_PAUSE_HOURS = 36;
export const STAGE_THRESHOLDS = [0, 25, 50, 75, 100] as const;
export const STAGE_LABELS = ["神秘的蛋 🥚", "開始破殼 🐣", "幼體出現 🐾", "快長大了！", "完全孵化 ✨"];

const STORE_KEY = "potluck-egg-state";

// ── Animal defs ───────────────────────────────────────────────────────────────
export const ANIMAL_DEFS = [
  { id: "red-panda",  name: "小熊貓",  stages: ["🥚", "🐣", "🦝", "🐼", "🌟🐼"] as const, color: "#e8956a" },
  { id: "shiba",      name: "柴犬",    stages: ["🥚", "🐣", "🐾", "🐕", "🦊"]   as const, color: "#f0b860" },
  { id: "penguin",    name: "企鵝",    stages: ["🥚", "🐣", "🐾", "🐧", "👑🐧"] as const, color: "#60b8f0" },
  { id: "hamster",    name: "倉鼠",    stages: ["🥚", "🐣", "🐾", "🐹", "✨🐹"] as const, color: "#f0a080" },
  { id: "otter",      name: "水獺",    stages: ["🥚", "🐣", "🐾", "🦦", "🌟🦦"] as const, color: "#60c8a0" },
  { id: "dragon",     name: "龍",      stages: ["🥚", "🐣", "🐾", "🐲", "🐉"]   as const, color: "#9a7ad8" },
  { id: "unicorn",    name: "獨角獸",  stages: ["🥚", "🐣", "🐾", "🦄", "✨🦄"] as const, color: "#e090d8" },
  { id: "owl",        name: "貓頭鷹",  stages: ["🥚", "🐣", "🐾", "🦉", "🌙🦉"] as const, color: "#8090c8" },
] as const;

export type AnimalDef = typeof ANIMAL_DEFS[number];

// ── Load / Save ───────────────────────────────────────────────────────────────
export function getEggState(): EggStoreState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as EggStoreState;
  } catch {}
  return { eggs: [], activeEggId: null };
}

function saveEggState(state: EggStoreState) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("egg-updated"));
}

export function onEggChange(cb: () => void): () => void {
  window.addEventListener("egg-updated", cb);
  return () => window.removeEventListener("egg-updated", cb);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pickRandomDef(eggs: Egg[]): AnimalDef {
  const recentIds = eggs.slice(-2).map((e) => e.defId);
  const pool = [...ANIMAL_DEFS].filter((d) => !recentIds.includes(d.id));
  return pool[Math.floor(Math.random() * pool.length)] ?? ANIMAL_DEFS[0];
}

export function getAnimalDef(defId: string): AnimalDef {
  return ANIMAL_DEFS.find((d) => d.id === defId) ?? ANIMAL_DEFS[0];
}

export function getEggEmoji(egg: Egg): string {
  return getAnimalDef(egg.defId).stages[egg.stage];
}

// ── 唯一的 stage 計算來源：effectivePoints ────────────────────────────────────
export function effectivePoints(egg: Egg): number {
  const penaltyPoints = egg.penaltyDays * POINTS_PER_PENALTY_DAY;
  return Math.max(0, Math.min(100, egg.hatchPoints - penaltyPoints));
}

export function calcStage(points: number): 0 | 1 | 2 | 3 | 4 {
  if (points >= 100) return 4;
  if (points >= 75)  return 3;
  if (points >= 50)  return 2;
  if (points >= 25)  return 1;
  return 0;
}

export function isEggPaused(egg: Egg): boolean {
  if (!egg.pausedAt) return false;
  const lastRecord = egg.records[egg.records.length - 1];
  const lastTime = lastRecord
    ? new Date(lastRecord.addedAt).getTime()
    : new Date(egg.createdAt).getTime();
  return (Date.now() - lastTime) / 3600000 > MAX_PAUSE_HOURS;
}

// ── 內部：更新 stage（統一呼叫點）────────────────────────────────────────────
function syncStage(egg: Egg, state: EggStoreState): 0 | 1 | 2 | 3 | 4 {
  const pts = effectivePoints(egg);
  const newStage = calcStage(pts);
  if (newStage > egg.stage) {
    egg.stage = newStage;
    if (newStage === 4) {
      egg.completedAt = new Date().toISOString();
      state.activeEggId = null;
    }
  }
  return egg.stage;
}

// ── Create egg from first cheat record ───────────────────────────────────────
export function createEggFromCheat(note: string, aiTasks: string[] = []): Egg {
  const state = getEggState();
  const def = pickRandomDef(state.eggs);
  const now = new Date().toISOString();

  if (aiTasks.length === 0) {
    aiTasks = ["多喝一杯溫開水", "下一餐多吃蔬菜", "飯後散步 15 分鐘", "減少沾醬", "早點休息"];
  }

  const tasks: EggTask[] = aiTasks.map(desc => ({
    id: crypto.randomUUID(),
    description: desc,
    isCompleted: false,
  }));

  const egg: Egg = {
    id: crypto.randomUUID(),
    defId: def.id,
    createdAt: now,
    hatchPoints: 0,
    penaltyDays: PENALTY_CHEAT,
    stage: 0,
    records: [{
      id: crypto.randomUUID(),
      type: "cheat",
      note,
      addedAt: now,
      pointsDelta: 0,
      penaltyDelta: PENALTY_CHEAT,
    }],
    pausedAt: now,
    tasks,
  };

  state.eggs.push(egg);
  state.activeEggId = egg.id;
  saveEggState(state);
  return egg;
}

// ── 記錄飲食（健康 / cheat / tip）────────────────────────────────────────────
export function addEggRecord(
  type: MealType,
  note: string,
): { egg: Egg; prevStage: 0|1|2|3|4; newStage: 0|1|2|3|4; delta: number } | null {
  const state = getEggState();
  if (!state.activeEggId) return null;
  const egg = state.eggs.find(e => e.id === state.activeEggId);
  if (!egg || egg.stage === 4) return null;

  const prevEffective = effectivePoints(egg);
  const prevStage = egg.stage;
  let pointsDelta = 0;
  let penaltyDelta = 0;

  if (type === "healthy") {
    pointsDelta = POINTS_PER_HEALTHY_MEAL;
    egg.hatchPoints = Math.min(100, egg.hatchPoints + pointsDelta);
  } else if (type === "cheat") {
    penaltyDelta = PENALTY_CHEAT;
    egg.penaltyDays += penaltyDelta;
  } else if (type === "tip") {
    penaltyDelta = -PENALTY_TIP_REDUCTION;
    egg.penaltyDays = Math.max(0, egg.penaltyDays + penaltyDelta);
  }

  egg.records.push({
    id: crypto.randomUUID(),
    type,
    note,
    addedAt: new Date().toISOString(),
    pointsDelta,
    penaltyDelta,
  });

  // 統一 stage 計算
  const newStage = syncStage(egg, state);
  const delta = effectivePoints(egg) - prevEffective;

  saveEggState(state);
  return { egg, prevStage, newStage, delta };
}

// ── 資源注入蛋（任務掉落後呼叫）─────────────────────────────────────────────
export function applyResourceToEgg(
  hatchBonus: number,
  penaltyReduce: number,
): { egg: Egg; prevStage: 0|1|2|3|4; newStage: 0|1|2|3|4 } | null {
  const state = getEggState();
  if (!state.activeEggId) return null;
  const egg = state.eggs.find(e => e.id === state.activeEggId);
  if (!egg || egg.stage === 4) return null;

  const prevStage = egg.stage;
  egg.hatchPoints = Math.min(100, egg.hatchPoints + hatchBonus);
  egg.penaltyDays = Math.max(0, egg.penaltyDays - penaltyReduce);

  const newStage = syncStage(egg, state);
  saveEggState(state);
  return { egg, prevStage, newStage };
}

// ── 任務操作（只改完成狀態，不動 stage）──────────────────────────────────────
export function toggleTask(eggId: string, taskId: string, forceStatus?: boolean) {
  const state = getEggState();
  const egg = state.eggs.find(e => e.id === eggId);
  if (!egg) return;
  const task = egg.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.isCompleted = forceStatus !== undefined ? forceStatus : !task.isCompleted;
  saveEggState(state);
}

export function addPenaltyTasks(eggId: string) {
  const state = getEggState();
  const egg = state.eggs.find(e => e.id === eggId);
  if (!egg) return;
  egg.tasks.push(
    { id: crypto.randomUUID(), description: "額外補充一份綠色蔬菜", isCompleted: false },
    { id: crypto.randomUUID(), description: "今天多喝 500cc 的水", isCompleted: false },
  );
  saveEggState(state);
}
export function replaceEggTasks(eggId: string, descriptions: string[]) {
  const state = getEggState();
  const egg = state.eggs.find(e => e.id === eggId);
  if (!egg) return;
  egg.tasks = descriptions.map(desc => ({
    id: crypto.randomUUID(),
    description: desc,
    isCompleted: false,
  }));
  saveEggState(state);
}
// ── Getters ───────────────────────────────────────────────────────────────────
export function getActiveEgg(): Egg | null {
  const state = getEggState();
  if (!state.activeEggId) return null;
  return state.eggs.find(e => e.id === state.activeEggId) ?? null;
}

export function getAllEggs(): Egg[] { return getEggState().eggs; }
export function getCompletedEggs(): Egg[] { return getEggState().eggs.filter(e => e.stage === 4); }
// 覆蓋蛋的任務（新的 cheat 記錄時使用）
