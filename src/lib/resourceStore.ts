// src/lib/resourceStore.ts
// 資源掉落 + Combo 系統

// ── 資源定義 ──────────────────────────────────────────────────────────────────
export type ResourceRarity = "common" | "rare" | "epic";

export interface ResourceDef {
  id: string;
  name: string;
  emoji: string;
  rarity: ResourceRarity;
  hatchBonus: number;    // 吸入蛋後增加的孵化點數
  penaltyReduce: number; // 減少的懲罰天數
  description: string;
}

export const RESOURCE_DEFS: ResourceDef[] = [
  // Common
  { id: "water_drop",    name: "純淨水滴",   emoji: "💧", rarity: "common", hatchBonus: 3,  penaltyReduce: 0,   description: "補充水分，幫助代謝" },
  { id: "fiber",         name: "膳食纖維",   emoji: "🌿", rarity: "common", hatchBonus: 4,  penaltyReduce: 0,   description: "穩定消化，提供基礎動力" },
  { id: "mineral",       name: "微量元素",   emoji: "⚗️", rarity: "common", hatchBonus: 3,  penaltyReduce: 0.1, description: "微量但重要的礦物質" },
  // Rare
  { id: "sunlight",      name: "溫暖陽光",   emoji: "☀️", rarity: "rare",   hatchBonus: 8,  penaltyReduce: 0.3, description: "促進維生素D合成，加速代謝" },
  { id: "protein_piece", name: "優質蛋白",   emoji: "🥩", rarity: "rare",   hatchBonus: 9,  penaltyReduce: 0.3, description: "修復細胞，強化孵化動力" },
  { id: "antioxidant",   name: "抗氧化素",   emoji: "🫐", rarity: "rare",   hatchBonus: 7,  penaltyReduce: 0.4, description: "對抗自由基，保護蛋的品質" },
  // Epic
  { id: "gene_map",      name: "核心基因圖譜", emoji: "🧬", rarity: "epic",  hatchBonus: 18, penaltyReduce: 0.8, description: "解鎖異變潛能，大幅加速孵化" },
  { id: "golden_spark",  name: "黃金火花",   emoji: "✨", rarity: "epic",   hatchBonus: 15, penaltyReduce: 1.0, description: "稀有爆擊，燃燒所有懲罰殘留" },
];

export function getResourceDef(id: string): ResourceDef {
  return RESOURCE_DEFS.find(r => r.id === id) ?? RESOURCE_DEFS[0];
}

// ── Combo 系統 ────────────────────────────────────────────────────────────────
export interface ComboState {
  count: number;          // 當前 Combo 數（0–5）
  lastTaskAt: string;     // 上次完成任務時間 ISO
  multiplier: number;     // 當前倍率
}

export const COMBO_CONFIG = {
  maxCombo: 5,
  expireMinutes: 30,      // 超過 30 分鐘沒完成任務 Combo 重置
  multipliers: [1.0, 1.0, 1.0, 1.2, 1.2, 1.5], // index = combo count
  rareChanceBoost: [0, 0, 0, 0.25, 0.25, 0.4],  // combo 3+ 稀有掉落機率加成
  guaranteedRareAt: 5,    // combo 5 必定掉落稀有
  critAt: 5,              // combo 5 觸發爆擊
};

// ── 掉落邏輯 ──────────────────────────────────────────────────────────────────
export interface DropResult {
  drops: Array<{ def: ResourceDef; amount: number }>;
  isCrit: boolean;
  comboCount: number;
  multiplier: number;
  totalHatchBonus: number;    // ← 加這個
  totalPenaltyReduce: number; // ← 加這個
}

export function rollDrops(taskCount: number, combo: ComboState): DropResult {
  const comboIdx = Math.min(combo.count, COMBO_CONFIG.maxCombo);
  const multiplier = COMBO_CONFIG.multipliers[comboIdx];
  const rareBoost = COMBO_CONFIG.rareChanceBoost[comboIdx];
  const isCrit = comboIdx >= COMBO_CONFIG.critAt;
  const guaranteedRare = comboIdx >= COMBO_CONFIG.guaranteedRareAt;

  const drops: Array<{ def: ResourceDef; amount: number }> = [];
  const baseCount = Math.max(1, taskCount);

  for (let i = 0; i < baseCount; i++) {
    const roll = Math.random();
    let pool: ResourceDef[];
    if (isCrit && i === 0)            pool = RESOURCE_DEFS.filter(r => r.rarity === "epic");
    else if (guaranteedRare && i === 0) pool = RESOURCE_DEFS.filter(r => r.rarity === "rare");
    else if (roll < 0.05 + rareBoost * 0.5) pool = RESOURCE_DEFS.filter(r => r.rarity === "epic");
    else if (roll < 0.25 + rareBoost)       pool = RESOURCE_DEFS.filter(r => r.rarity === "rare");
    else                              pool = RESOURCE_DEFS.filter(r => r.rarity === "common");

    const def = pool[Math.floor(Math.random() * pool.length)];
    const existing = drops.find(d => d.def.id === def.id);
    const amount = Math.round(multiplier);
    if (existing) existing.amount += amount;
    else drops.push({ def, amount });
  }

  return {
    drops,
    isCrit,
    comboCount: comboIdx,
    multiplier,
    totalHatchBonus: drops.reduce((s, d) => s + d.def.hatchBonus * d.amount, 0),
    totalPenaltyReduce: drops.reduce((s, d) => s + d.def.penaltyReduce * d.amount, 0),
  };
}

// ── Inventory ──────────────────────────────────────────────────────────────────
export interface InventoryItem {
  defId: string;
  amount: number;
  earnedAt: string;
}

export interface ResourceState {
  inventory: InventoryItem[];
  combo: ComboState;
  totalEarned: number;
}

const RES_KEY = "buddybite-resources";

export function getResourceState(): ResourceState {
  try {
    const raw = localStorage.getItem(RES_KEY);
    if (raw) return JSON.parse(raw) as ResourceState;
  } catch {}
  return {
    inventory: [],
    combo: { count: 0, lastTaskAt: new Date().toISOString(), multiplier: 1.0 },
    totalEarned: 0,
  };
}

function saveResourceState(state: ResourceState) {
  localStorage.setItem(RES_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event("resource-updated"));
}

export function onResourceChange(cb: () => void): () => void {
  window.addEventListener("resource-updated", cb);
  return () => window.removeEventListener("resource-updated", cb);
}

// ── Combo 更新 ────────────────────────────────────────────────────────────────
export function updateCombo(state: ResourceState): ComboState {
  const now = Date.now();
  const last = new Date(state.combo.lastTaskAt).getTime();
  const minutesSince = (now - last) / 60000;

  if (minutesSince > COMBO_CONFIG.expireMinutes && state.combo.count > 0) {
    // Combo 過期重置
    state.combo = { count: 1, lastTaskAt: new Date().toISOString(), multiplier: 1.0 };
  } else {
    state.combo.count = Math.min(state.combo.count + 1, COMBO_CONFIG.maxCombo);
    state.combo.lastTaskAt = new Date().toISOString();
    state.combo.multiplier = COMBO_CONFIG.multipliers[state.combo.count];
  }
  return state.combo;
}

// ── 完成任務：更新 Combo + 掉落 + 加入庫存 ───────────────────────────────────
export function completeTask(taskCount: number): DropResult {
  const state = getResourceState();
  const combo = updateCombo(state);
  const result = rollDrops(taskCount, combo);

  const now = new Date().toISOString();
  for (const { def, amount } of result.drops) {
    const existing = state.inventory.find(i => i.defId === def.id);
    if (existing) existing.amount += amount;
    else state.inventory.push({ defId: def.id, amount, earnedAt: now });
  }
  state.totalEarned += result.drops.reduce((sum, d) => sum + d.amount, 0);
  state.combo = combo;

  saveResourceState(state);
  return result; // totalHatchBonus 和 totalPenaltyReduce 已在 rollDrops 裡算好
}

// ── 使用資源注入蛋（吸收加速） ───────────────────────────────────────────────
export function consumeResourcesForEgg(defIds: string[]): { hatchBonus: number; penaltyReduce: number } {
  const state = getResourceState();
  let totalHatch = 0;
  let totalPenalty = 0;

  for (const id of defIds) {
    const item = state.inventory.find(i => i.defId === id);
    if (!item || item.amount <= 0) continue;
    const def = getResourceDef(id);
    item.amount -= 1;
    totalHatch += def.hatchBonus;
    totalPenalty += def.penaltyReduce;
  }

  saveResourceState(state);
  return { hatchBonus: totalHatch, penaltyReduce: totalPenalty };
}
