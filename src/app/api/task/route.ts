import { NextRequest, NextResponse } from "next/server";

type ResourceRarity = "common" | "rare" | "epic";

const RESOURCE_DEFS = [
  { id: "water_drop",    name: "純淨水滴",     emoji: "💧", rarity: "common" as ResourceRarity, hatchBonus: 3,  penaltyReduce: 0,   description: "補充水分，幫助代謝" },
  { id: "fiber",         name: "膳食纖維",     emoji: "🌿", rarity: "common" as ResourceRarity, hatchBonus: 4,  penaltyReduce: 0,   description: "穩定消化，提供基礎動力" },
  { id: "mineral",       name: "微量元素",     emoji: "⚗️", rarity: "common" as ResourceRarity, hatchBonus: 3,  penaltyReduce: 0.1, description: "微量但重要的礦物質" },
  { id: "sunlight",      name: "溫暖陽光",     emoji: "☀️", rarity: "rare"   as ResourceRarity, hatchBonus: 8,  penaltyReduce: 0.3, description: "促進維生素D合成，加速代謝" },
  { id: "protein_piece", name: "優質蛋白",     emoji: "🥩", rarity: "rare"   as ResourceRarity, hatchBonus: 9,  penaltyReduce: 0.3, description: "修復細胞，強化孵化動力" },
  { id: "antioxidant",   name: "抗氧化素",     emoji: "🫐", rarity: "rare"   as ResourceRarity, hatchBonus: 7,  penaltyReduce: 0.4, description: "對抗自由基，保護蛋的品質" },
  { id: "gene_map",      name: "核心基因圖譜", emoji: "🧬", rarity: "epic"   as ResourceRarity, hatchBonus: 18, penaltyReduce: 0.8, description: "解鎖異變潛能，大幅加速孵化" },
  { id: "golden_spark",  name: "黃金火花",     emoji: "✨", rarity: "epic"   as ResourceRarity, hatchBonus: 15, penaltyReduce: 1.0, description: "稀有爆擊，燃燒所有懲罰殘留" },
];

const MULTIPLIERS  = [1.0, 1.0, 1.0, 1.2, 1.2, 1.5];
const RARE_BOOST   = [0,   0,   0,   0.25, 0.25, 0.4];

function rollDrops(taskCount: number, comboCount: number) {
  const idx = Math.min(comboCount, 5);
  const multiplier = MULTIPLIERS[idx];
  const rareBoost  = RARE_BOOST[idx];
  const isCrit     = idx >= 5;
  const drops: any[] = [];

  for (let i = 0; i < Math.max(1, taskCount); i++) {
    const roll = Math.random();
    let pool = RESOURCE_DEFS;
    if (isCrit && i === 0)            pool = RESOURCE_DEFS.filter(r => r.rarity === "epic");
    else if (idx >= 5 && i === 0)     pool = RESOURCE_DEFS.filter(r => r.rarity === "rare");
    else if (roll < 0.05 + rareBoost * 0.5) pool = RESOURCE_DEFS.filter(r => r.rarity === "epic");
    else if (roll < 0.25 + rareBoost)       pool = RESOURCE_DEFS.filter(r => r.rarity === "rare");
    else                              pool = RESOURCE_DEFS.filter(r => r.rarity === "common");

    const def = pool[Math.floor(Math.random() * pool.length)];
    const amount = Math.max(1, Math.round(multiplier));
    const ex = drops.find(d => d.id === def.id);
    if (ex) ex.amount += amount;
    else drops.push({ ...def, amount });
  }
  return { drops, isCrit, multiplier };
}

export async function POST(req: NextRequest) {
  try {
    const { taskCount = 1, comboCount = 0 } = await req.json();
    const { drops, isCrit, multiplier } = rollDrops(taskCount, comboCount);
    return NextResponse.json({
      drops,
      isCrit,
      comboCount,
      multiplier,
      totalHatchBonus:    drops.reduce((s: number, d: any) => s + d.hatchBonus    * d.amount, 0),
      totalPenaltyReduce: drops.reduce((s: number, d: any) => s + d.penaltyReduce * d.amount, 0),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
