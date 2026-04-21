"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  HatchedAnimal, ZooState, getZooState, getAnimalDef, getAnimalEmoji,
  getStageName, getWeekKey, onZooChange, ANIMAL_DEFS,
} from "@/lib/animalStore";
import {
  NotificationSettings, getNotificationSettings, saveNotificationSettings, requestPermission,
} from "@/lib/notification";
import { getFoodLog } from "@/lib/foodStore";

// ── Weekly progress calculator ─────────────────────────────────────────────────
function calcWeekProgress(goal: number): number {
  if (goal <= 0) return 0;
  const log = getFoodLog();
  const weekKey = getWeekKey();
  const now = new Date();

  // Get days in this week that have passed
  let totalPct = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay() + i + 1); // Mon-Sun
    if (d > now) break;
    const ds = d.toDateString();
    const dayEntries = log.filter((e) => new Date(e.addedAt).toDateString() === ds);
    const dayKcal = dayEntries.reduce((s, e) => s + (e.calories ?? 0), 0);
    totalPct += Math.min(100, (dayKcal / goal) * 100);
  }
  return Math.round(totalPct / 7);
}

// ── Egg animation ─────────────────────────────────────────────────────────────
function EggDisplay({ animal, weekPct }: { animal: HatchedAnimal | null; weekPct: number }) {
  const def = animal ? getAnimalDef(animal.defId) : null;
  const emoji = animal ? getAnimalEmoji(animal) : "🥚";
  const stage = animal?.stage ?? 0;
  const stageName = getStageName(stage);
  const animalName = def?.name ?? "神秘動物";

  const stageColors = ["#f0ebe8", "#fce4d0", "#e8d5f0", "#d5e8f0", "#d5f0e8"];
  const bgColor = stageColors[stage] ?? "#f0ebe8";

  return (
    <div style={{
      margin: "0 20px 24px",
      background: "rgba(255,255,255,0.65)",
      backdropFilter: "blur(16px)",
      border: "0.5px solid rgba(255,255,255,0.9)",
      borderRadius: 24,
      padding: "24px 20px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
    }}>
      <p style={{ fontSize: 13, color: "#a090b0", fontWeight: 500 }}>本週孵化中</p>

      {/* Egg / animal display */}
      <div style={{
        width: 100, height: 100, borderRadius: "50%",
        background: bgColor,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 52,
        boxShadow: `0 0 30px ${bgColor}`,
        animation: "pulse 2s ease-in-out infinite",
      }}>
        {emoji}
      </div>

      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: 16, fontWeight: 500, color: "#3d2e3d" }}>
          {stage === 0 ? "神秘的蛋" : animalName}
        </p>
        <p style={{ fontSize: 12, color: "#a090b0", marginTop: 2 }}>{stageName}</p>
      </div>

      {/* Progress bar */}
      <div style={{ width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#a090b0", marginBottom: 6 }}>
          <span>本週達成率</span>
          <span>{weekPct}%</span>
        </div>
        <div style={{ height: 8, background: "#f0ebe8", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 4,
            background: "linear-gradient(90deg, #9a7ad8, #c0a0e8)",
            width: `${weekPct}%`,
            transition: "width 0.6s ease",
          }} />
        </div>
        {/* Stage markers */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          {[20, 40, 60, 80, 100].map((pct, i) => (
            <span key={i} style={{ fontSize: 9, color: weekPct >= pct ? "#9a7ad8" : "#d0c8d8" }}>
              {["破殼", "幼體", "成體", "完全體", "🎉"][i]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Zoo collection ────────────────────────────────────────────────────────────
function ZooCollection({ animals }: { animals: HatchedAnimal[] }) {
  const completed = animals.filter((a) => a.stage === 4);
  const inProgress = animals.filter((a) => a.stage < 4 && a.weekKey !== getWeekKey());

  if (completed.length === 0 && inProgress.length === 0) {
    return (
      <div style={{ margin: "0 20px", textAlign: "center", padding: "20px 0" }}>
        <p style={{ fontSize: 14, color: "#a090b0" }}>完成週目標就能獲得新動物！</p>
      </div>
    );
  }

  return (
    <div style={{ margin: "0 20px" }}>
      {completed.length > 0 && (
        <>
          <p style={{ fontSize: 13, fontWeight: 500, color: "#a090b0", marginBottom: 12 }}>
            🏆 我的動物們（{completed.length} 隻）
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            {completed.map((a) => {
              const def = getAnimalDef(a.defId);
              return (
                <div key={a.id} style={{
                  background: "rgba(255,255,255,0.6)",
                  backdropFilter: "blur(10px)",
                  border: "0.5px solid rgba(255,255,255,0.9)",
                  borderRadius: 14,
                  padding: "12px 8px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                }}>
                  <span style={{ fontSize: 28 }}>{getAnimalEmoji(a)}</span>
                  <span style={{ fontSize: 10, color: "#5a4a6a", textAlign: "center" }}>{def.name}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Notification Settings ─────────────────────────────────────────────────────
function NotificationSettingsPanel() {
  const [settings, setSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [permissionGranted, setPermissionGranted] = useState(
    typeof window !== "undefined" && Notification.permission === "granted"
  );

  async function handleRequestPermission() {
    const granted = await requestPermission();
    setPermissionGranted(granted);
  }

  function update(patch: Partial<NotificationSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveNotificationSettings(next);
  }

  return (
    <div style={{
      margin: "0 20px 24px",
      background: "rgba(255,255,255,0.6)",
      backdropFilter: "blur(14px)",
      border: "0.5px solid rgba(255,255,255,0.9)",
      borderRadius: 20, padding: "18px 16px",
    }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: "#3d2e3d", marginBottom: 14 }}>🔔 提醒設定</p>

      {!permissionGranted && (
        <button onClick={handleRequestPermission} style={{
          width: "100%", padding: "10px", borderRadius: 12, border: "none",
          background: "rgba(122,90,154,0.1)", color: "#7a5a9a",
          fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 14,
        }}>
          開啟通知權限
        </button>
      )}

      {/* 喝水提醒 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 13, color: "#3d2e3d" }}>💧 早晨喝水提醒</p>
          <p style={{ fontSize: 11, color: "#a090b0" }}>起床後提醒喝一杯水</p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="time" value={settings.waterTime}
            onChange={(e) => update({ waterTime: e.target.value })}
            style={{ fontSize: 12, border: "0.5px solid rgba(200,180,220,0.5)", borderRadius: 8, padding: "4px 8px", background: "rgba(255,255,255,0.7)", outline: "none", color: "#3d2e3d" }} />
        </label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <input type="checkbox" checked={settings.waterEnabled}
          onChange={(e) => update({ waterEnabled: e.target.checked })}
          style={{ accentColor: "#7a5a9a" }} />
        <span style={{ fontSize: 12, color: "#a090b0" }}>啟用</span>
      </div>

      {/* 感恩提醒 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <p style={{ fontSize: 13, color: "#3d2e3d" }}>🌸 睡前感恩提醒</p>
          <p style={{ fontSize: 11, color: "#a090b0" }}>提醒記錄今天三件小事</p>
        </div>
        <input type="time" value={settings.gratitudeTime}
          onChange={(e) => update({ gratitudeTime: e.target.value })}
          style={{ fontSize: 12, border: "0.5px solid rgba(200,180,220,0.5)", borderRadius: 8, padding: "4px 8px", background: "rgba(255,255,255,0.7)", outline: "none", color: "#3d2e3d" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={settings.gratitudeEnabled}
          onChange={(e) => update({ gratitudeEnabled: e.target.checked })}
          style={{ accentColor: "#7a5a9a" }} />
        <span style={{ fontSize: 12, color: "#a090b0" }}>啟用</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ZooPage() {
  const [zooState, setZooState] = useState<ZooState>({ animals: [], currentEggId: null, weekProgress: {} });
  const [weekPct, setWeekPct] = useState(0);
  const [goal, setGoal] = useState(2000);

  useEffect(() => {
    const savedGoal = parseInt(localStorage.getItem("diet-kcal-goal") ?? "2000");
    setGoal(savedGoal);
    setZooState(getZooState());
    setWeekPct(calcWeekProgress(savedGoal));
    return onZooChange(() => {
      setZooState(getZooState());
      setWeekPct(calcWeekProgress(savedGoal));
    });
  }, []);

  const weekKey = getWeekKey();
  const currentAnimal = zooState.animals.find((a) => a.weekKey === weekKey) ?? null;
  const pastAnimals = zooState.animals.filter((a) => a.weekKey !== weekKey);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500&family=DM+Serif+Display:ital@0;1&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { min-height: 100dvh; }
        body { font-family: 'Noto Sans TC', sans-serif; background: #faf7f5; color: #3d2e3d; }
        .blobs { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
        .blob { position: absolute; border-radius: 50%; filter: blur(70px); }
        .b1 { width: 280px; height: 280px; background: radial-gradient(#e8d5f0, transparent 70%); top: -60px; right: -60px; }
        .b2 { width: 220px; height: 220px; background: radial-gradient(#d5f0e8, transparent 70%); bottom: 10%; left: -50px; }
        .b3 { width: 180px; height: 180px; background: radial-gradient(#fce4d0, transparent 70%); top: 40%; right: -30px; }
        .page { position: relative; z-index: 1; max-width: 430px; margin: 0 auto; padding: 0 0 40px; min-height: 100dvh; }
        .hdr { padding: 52px 20px 20px; display: flex; align-items: center; justify-content: space-between; }
        .hdr-left { display: flex; align-items: center; gap: 12px; }
        .back-btn { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,0.7); border: 0.5px solid rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; font-size: 16px; color: #5a4a5a; text-decoration: none; backdrop-filter: blur(10px); }
        .hdr-title { font-family: 'DM Serif Display', serif; font-size: 22px; color: #3d2e3d; }
        .gratitude-link { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 20px; background: rgba(240,160,96,0.1); border: 0.5px solid rgba(240,160,96,0.3); font-size: 12px; color: #c08060; text-decoration: none; transition: background 0.15s; }
        .gratitude-link:hover { background: rgba(240,160,96,0.18); }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="blobs">
        <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      </div>

      <div className="page">
        <div className="hdr">
          <div className="hdr-left">
            <Link href="/" className="back-btn">←</Link>
            <span className="hdr-title">我的動物園 🥚</span>
          </div>
          <Link href="/gratitude" className="gratitude-link">🌸 感恩小記</Link>
        </div>

        <EggDisplay animal={currentAnimal} weekPct={weekPct} />
        <ZooCollection animals={pastAnimals} />
        <NotificationSettingsPanel />
      </div>
    </>
  );
}