"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getAllEggs, getCompletedEggs, getActiveEgg,
  getEggEmoji, getAnimalDef, effectivePoints, isEggPaused,
  onEggChange, Egg, STAGE_LABELS, ANIMAL_DEFS,
} from "@/lib/eggStore";

function EggDetailCard({ egg }: { egg: Egg }) {
  const def = getAnimalDef(egg.defId);
  const emoji = getEggEmoji(egg);
  const pts = effectivePoints(egg);
  const paused = isEggPaused(egg);
  const isComplete = egg.stage === 4;
  const healthyCount = egg.records.filter(r => r.type === "healthy").length;
  const cheatCount = egg.records.filter(r => r.type === "cheat").length;
  const tipCount = egg.records.filter(r => r.type === "tip").length;
  const createdDate = new Date(egg.createdAt).toLocaleDateString("zh-TW", { month: "short", day: "numeric" });
  const completedDate = egg.completedAt
    ? new Date(egg.completedAt).toLocaleDateString("zh-TW", { month: "short", day: "numeric" })
    : null;

  const stageColors = ["#f5f0ea", "#fce4d0", "#e8d5f0", "#d5e8f0", "#d5f0e8"];

  return (
    <div style={{
      background: "rgba(255,255,255,0.72)", backdropFilter: "blur(16px)",
      border: "0.5px solid rgba(200,230,160,0.5)", borderRadius: 20, padding: "16px",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: stageColors[egg.stage],
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34,
          animation: isComplete ? "spin 4s linear infinite" : paused ? "none" : "pulse 2s ease-in-out infinite",
          filter: paused && !isComplete ? "grayscale(0.5)" : "none",
        }}>
          {emoji}
        </div>
        <div>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#2d4a1e" }}>
            {egg.stage === 0 ? "神秘的蛋" : def.name}
          </p>
          <p style={{ fontSize: 11, color: "#a0b890" }}>
            {STAGE_LABELS[egg.stage]}
            {!isComplete && egg.penaltyDays > 0 && (
              <span style={{ color: "#c09060", marginLeft: 5 }}>延後 {egg.penaltyDays.toFixed(1)} 天</span>
            )}
          </p>
          <p style={{ fontSize: 10, color: "#b0c8a0", marginTop: 2 }}>
            {createdDate} 誕生{completedDate ? ` → ${completedDate} 孵化` : ""}
          </p>
        </div>
      </div>

      {!isComplete && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#a0b890", marginBottom: 5 }}>
            <span>孵化進度</span><span>{Math.round(pts)}%</span>
          </div>
          <div style={{ height: 8, background: "rgba(160,200,100,0.2)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4,
              background: paused ? "linear-gradient(90deg,#c0c0b8,#d8d8d0)" : "linear-gradient(90deg,#7ac840,#a0d860)",
              width: `${pts}%`, transition: "width 0.6s ease",
            }} />
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Pill icon="🥗" label="健康餐" val={healthyCount} />
        <Pill icon="🍕" label="Cheat" val={cheatCount} />
        <Pill icon="💧" label="小方法" val={tipCount} />
      </div>

      {paused && !isComplete && (
        <p style={{ fontSize: 12, color: "#c06040", background: "rgba(200,100,60,0.06)", borderRadius: 10, padding: "7px 11px" }}>
          ⏸ 超過 36 小時沒記錄，暫停孵化中
        </p>
      )}
    </div>
  );
}

function Pill({ icon, label, val }: { icon: string; label: string; val: number }) {
  return (
    <div style={{ flex: 1, background: "rgba(160,200,100,0.08)", borderRadius: 10, padding: "7px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 16 }}>{icon}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#5a9e30" }}>{val}</div>
      <div style={{ fontSize: 9, color: "#a0b890" }}>{label}</div>
    </div>
  );
}

export default function ZooPage() {
  const [eggs, setEggs] = useState<Egg[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEggs(getAllEggs());
    setHydrated(true);
    const unsub = onEggChange(() => setEggs(getAllEggs()));
    return unsub;
  }, []);

  if (!hydrated) return null;

  const active = eggs.find(e => e.stage < 4);
  const completed = eggs.filter(e => e.stage === 4).reverse();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500&family=DM+Serif+Display:ital@0;1&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; background: #e8f5d0; font-family: 'Noto Sans TC', sans-serif; color: #2d4a1e; }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "54px 16px 40px", minHeight: "100dvh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22 }}>動物園 🦎</h1>
            <p style={{ fontSize: 11, color: "#88a870", marginTop: 2 }}>你孵化的夥伴們</p>
          </div>
          <Link href="/" style={{ padding: "6px 14px", borderRadius: 18, background: "rgba(255,255,255,0.75)", border: "0.5px solid rgba(160,210,100,0.5)", fontSize: 12, color: "#5a9e30", textDecoration: "none" }}>
            ← 回派對
          </Link>
        </div>

        {active && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, color: "#a0b890", fontWeight: 500, marginBottom: 8 }}>孵化中</p>
            <EggDetailCard egg={active} />
          </div>
        )}

        {completed.length > 0 && (
          <div>
            <p style={{ fontSize: 11, color: "#a0b890", fontWeight: 500, marginBottom: 10 }}>
              已孵化 {completed.length} 隻
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {completed.map(egg => <EggDetailCard key={egg.id} egg={egg} />)}
            </div>
          </div>
        )}

        {eggs.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🥚</div>
            <p style={{ fontSize: 15, color: "#5a9e30", fontWeight: 500 }}>還沒有蛋</p>
            <p style={{ fontSize: 13, color: "#a0b890", marginTop: 6, lineHeight: 1.6 }}>
              回到派對記錄你的第一餐<br/>就會獲得一顆蛋！
            </p>
          </div>
        )}

        {/* Animal guide */}
        <div style={{ marginTop: 28, background: "rgba(255,255,255,0.6)", backdropFilter: "blur(10px)", borderRadius: 16, padding: "14px 16px", border: "0.5px solid rgba(200,230,160,0.4)" }}>
          <p style={{ fontSize: 11, color: "#a0b890", fontWeight: 500, marginBottom: 10 }}>可能孵出的動物</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {[...ANIMAL_DEFS].map(def => (
              <div key={def.id} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24 }}>{def.stages[4]}</div>
                <div style={{ fontSize: 9, color: "#a0b890", marginTop: 2 }}>{def.name}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
