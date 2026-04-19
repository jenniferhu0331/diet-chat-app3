"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  FoodEntry,
  getFoodLog,
  addFoodEntry,
  removeFoodEntry,
  onFoodLogChange,
  getTodaySummary,
  DailySummary,
} from "@/lib/foodStore";
import BarcodeScanner from "@/components/BarcodeScanner";

const GOAL_KEY = "diet-kcal-goal";
const DEFAULT_GOAL = 2000;

const MEALS = ["早餐", "午餐", "晚餐", "點心"] as const;
type Meal = (typeof MEALS)[number];
const MEAL_EMOJI: Record<Meal, string> = { 早餐: "🌅", 午餐: "☀️", 晚餐: "🌙", 點心: "🍪" };

// ── Goal Editor ───────────────────────────────────────────────────────────────
function GoalEditor({ goal, onSave }: { goal: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(goal));
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  function confirm() { const n = parseInt(val); if (n > 0) onSave(n); setEditing(false); }
  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input ref={inputRef} type="number" value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") confirm(); if (e.key === "Escape") setEditing(false); }}
          style={{ width: 80, padding: "4px 8px", borderRadius: 10, border: "0.5px solid rgba(122,90,154,0.4)", background: "rgba(255,255,255,0.8)", fontFamily: "inherit", fontSize: 14, color: "#3d2e3d", outline: "none" }} />
        <button onClick={confirm} style={{ fontSize: 12, color: "#7a5a9a", background: "none", border: "none", cursor: "pointer" }}>確定</button>
      </div>
    );
  }
  return (
    <button onClick={() => { setVal(String(goal)); setEditing(true); }}
      style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
      <span style={{ fontSize: 13, color: "#a090b0" }}>目標 {goal} kcal</span>
      <span style={{ fontSize: 11, color: "#c0b0c8" }}>✎</span>
    </button>
  );
}

// ── Add Modal ─────────────────────────────────────────────────────────────────
interface AddModalProps {
  onClose: () => void;
  onAdd: (entry: Omit<FoodEntry, "id" | "addedAt">) => void;
  targetDate: Date; // 新增：記錄到哪一天
}

function AddModal({ onClose, onAdd, targetDate }: AddModalProps) {
  const [name, setName] = useState("");
  const [meal, setMeal] = useState<Meal>("午餐");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const h = new Date().getHours();
    if (h < 10) setMeal("早餐");
    else if (h < 14) setMeal("午餐");
    else if (h < 20) setMeal("晚餐");
    else setMeal("點心");
  }, []);

  async function estimate() {
    if (!name.trim()) return;
    setEstimating(true);
    try {
      const res = await fetch("/api/nutrition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foodName: name.trim() }) });
      const data = await res.json();
      if (data.calories) setCalories(String(data.calories));
      if (data.protein) setProtein(String(data.protein));
      if (data.fat) setFat(String(data.fat));
      if (data.carbs) setCarbs(String(data.carbs));
    } catch {}
    setEstimating(false);
  }

  function submit() {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(), meal,
      calories: calories ? Number(calories) : undefined,
      protein: protein ? Number(protein) : undefined,
      fat: fat ? Number(fat) : undefined,
      carbs: carbs ? Number(carbs) : undefined,
      source: "manual",
    });
    onClose();
  }

  const isToday = targetDate.toDateString() === new Date().toDateString();
  const dateLabel = isToday ? "今天" : targetDate.toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" });

  return (
    <>
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-handle" />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <p className="modal-title" style={{ marginBottom: 0 }}>新增食物</p>
            {!isToday && (
              <span style={{ fontSize: 12, color: "#7a5a9a", background: "rgba(122,90,154,0.1)", borderRadius: 10, padding: "4px 10px" }}>
                補記 {dateLabel}
              </span>
            )}
          </div>

          <label className="field-label">食物名稱</label>
          <input ref={nameRef} className="field-input"
            placeholder="例：滷肉飯、珍珠奶茶"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => setShowScanner(true)} style={{
              flex: 1, padding: "9px 0", borderRadius: 12,
              background: "rgba(96,184,240,0.1)", border: "0.5px solid rgba(96,184,240,0.3)",
              color: "#4090b8", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}>📷 掃描條碼</button>
            <button onClick={estimate} disabled={!name.trim() || estimating} style={{
              flex: 1, padding: "9px 0", borderRadius: 12,
              background: "rgba(122,90,154,0.1)", border: "0.5px solid rgba(122,90,154,0.2)",
              color: "#7a5a9a", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}>{estimating ? "估算中…" : "✨ AI 估算"}</button>
          </div>

          <label className="field-label">餐別</label>
          <div className="meal-pills">
            {MEALS.map((m) => (
              <button key={m} className={`meal-pill${meal === m ? " active" : ""}`} onClick={() => setMeal(m)}>
                {MEAL_EMOJI[m]} {m}
              </button>
            ))}
          </div>

          <label className="field-label">營養資訊</label>
          <div className="macro-row">
            {[
              { label: "熱量 kcal", val: calories, set: setCalories },
              { label: "蛋白質 g", val: protein, set: setProtein },
              { label: "脂肪 g", val: fat, set: setFat },
              { label: "碳水 g", val: carbs, set: setCarbs },
            ].map(({ label, val, set }) => (
              <div key={label} className="macro-field">
                <span className="macro-label">{label}</span>
                <input className="macro-input" type="number" min="0" placeholder="—" value={val} onChange={(e) => set(e.target.value)} />
              </div>
            ))}
          </div>

          <button className="btn-primary" onClick={submit} disabled={!name.trim()}>記錄下來</button>
          <button className="btn-ghost" onClick={onClose}>取消</button>
        </div>
      </div>

      {showScanner && (
        <BarcodeScanner
          onClose={() => setShowScanner(false)}
          onResult={(result) => {
            setName(result.name);
            setCalories(String(result.calories));
            setProtein(String(result.protein));
            setFat(String(result.fat));
            setCarbs(String(result.carbs));
            setShowScanner(false);
          }}
        />
      )}
    </>
  );
}

// ── Entry Card ────────────────────────────────────────────────────────────────
function EntryCard({ entry, onDelete }: { entry: FoodEntry; onDelete: () => void }) {
  const hasMacros = entry.calories || entry.protein || entry.fat || entry.carbs;
  const time = new Date(entry.addedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="entry-card">
      <div className="entry-left">
        <span className="entry-meal-dot" data-meal={entry.meal} />
        <div>
          <p className="entry-name">{entry.name}</p>
          {hasMacros && (
            <p className="entry-macros">
              {entry.calories ? `${entry.calories} kcal` : ""}
              {entry.protein ? ` · 蛋白 ${entry.protein}g` : ""}
              {entry.fat ? ` · 脂 ${entry.fat}g` : ""}
              {entry.carbs ? ` · 碳 ${entry.carbs}g` : ""}
            </p>
          )}
          <p className="entry-time">{entry.source === "chat" ? "💬 " : ""}{time}</p>
        </div>
      </div>
      <button className="entry-delete" onClick={onDelete} aria-label="刪除">×</button>
    </div>
  );
}

// ── Macro Ring ────────────────────────────────────────────────────────────────
function MacroRing({ label, value, unit, color, max }: { label: string; value: number; unit: string; color: string; max: number }) {
  const pct = Math.min(value / max, 1);
  const r = 22;
  const circ = 2 * Math.PI * r;
  return (
    <div className="ring-wrap">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="#f0ebe8" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 28 28)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
      </svg>
      <div className="ring-center"><span className="ring-val">{Math.round(value)}</span></div>
      <p className="ring-label">{label}</p>
      <p className="ring-unit">{unit}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DiaryPage() {
  const [log, setLog] = useState<FoodEntry[]>([]);
  const [summary, setSummary] = useState<DailySummary>({ totalCalories: 0, totalProtein: 0, totalFat: 0, totalCarbs: 0, entries: [] });
  const [showModal, setShowModal] = useState(false);
  const [activeDay, setActiveDay] = useState<string>(new Date().toDateString());
  const [goal, setGoal] = useState(DEFAULT_GOAL);

  useEffect(() => {
    const saved = localStorage.getItem(GOAL_KEY);
    if (saved) setGoal(parseInt(saved));
  }, []);

  function saveGoal(v: number) { setGoal(v); localStorage.setItem(GOAL_KEY, String(v)); }

  function refresh() { setLog(getFoodLog()); setSummary(getTodaySummary()); }
  useEffect(() => { refresh(); return onFoodLogChange(refresh); }, []);

  // 計算選取日期的摘要
  const dayEntries = log.filter((e) => new Date(e.addedAt).toDateString() === activeDay);
  const dayCalories = dayEntries.reduce((s, e) => s + (e.calories ?? 0), 0);
  const byMeal = MEALS.reduce((acc, m) => {
    acc[m] = dayEntries.filter((e) => e.meal === m);
    return acc;
  }, {} as Record<Meal, FoodEntry[]>);

  // 日期從左到右（舊到新）
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i)); // 從6天前到今天
    return d;
  });

  const activeDateObj = new Date(activeDay);
  const isActiveToday = activeDay === new Date().toDateString();
  const kcalForDisplay = isActiveToday ? summary.totalCalories : dayCalories;
  const kcalPct = Math.min(kcalForDisplay / goal, 1);
  const remaining = Math.max(goal - kcalForDisplay, 0);

  // 新增食物時帶入選取的日期
  function handleAdd(entry: Omit<FoodEntry, "id" | "addedAt">) {
    // 設定 addedAt 為選取日期的當前時間（補記時用選取日的日期）
    const targetDate = new Date(activeDay);
    const now = new Date();
    targetDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    addFoodEntry({ ...entry, source: "manual" }, targetDate.toISOString());
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500&family=DM+Serif+Display:ital@0;1&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { min-height: 100dvh; }
        body { font-family: 'Noto Sans TC', sans-serif; background: #faf7f5; color: #3d2e3d; }
        .blobs { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
        .blob { position: absolute; border-radius: 50%; filter: blur(70px); }
        .b1 { width: 300px; height: 300px; background: radial-gradient(#e8d5f0, transparent 70%); top: -80px; right: -80px; }
        .b2 { width: 240px; height: 240px; background: radial-gradient(#fce4d0, transparent 70%); bottom: 10%; left: -60px; }
        .b3 { width: 180px; height: 180px; background: radial-gradient(#d5e8f0, transparent 70%); top: 45%; right: -40px; }
        .page { position: relative; z-index: 1; max-width: 430px; margin: 0 auto; padding: 0 0 100px; min-height: 100dvh; }
        .hdr { padding: 52px 20px 16px; display: flex; align-items: center; justify-content: space-between; }
        .hdr-left { display: flex; align-items: center; gap: 12px; }
        .back-btn { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,0.7); border: 0.5px solid rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; font-size: 16px; color: #5a4a5a; text-decoration: none; backdrop-filter: blur(10px); }
        .hdr-title { font-family: 'DM Serif Display', serif; font-size: 22px; color: #3d2e3d; }
        .add-btn { width: 36px; height: 36px; border-radius: 50%; background: #7a5a9a; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 20px; color: #fff; transition: transform 0.15s, background 0.15s; }
        .add-btn:hover { background: #6a4a8a; transform: scale(1.05); }
        .day-scroll { display: flex; gap: 8px; overflow-x: auto; padding: 0 20px 16px; scrollbar-width: none; }
        .day-scroll::-webkit-scrollbar { display: none; }
        .day-chip { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; padding: 8px 14px; border-radius: 14px; background: rgba(255,255,255,0.55); backdrop-filter: blur(10px); border: 0.5px solid rgba(255,255,255,0.9); cursor: pointer; transition: all 0.15s; min-width: 52px; }
        .day-chip.active { background: #7a5a9a; border-color: #7a5a9a; }
        .day-chip.active .day-name, .day-chip.active .day-num { color: #fff; }
        .day-name { font-size: 11px; color: #a090b0; font-weight: 500; }
        .day-num { font-size: 18px; color: #3d2e3d; font-weight: 500; line-height: 1.2; }
        .summary { margin: 4px 20px 20px; background: rgba(255,255,255,0.6); backdrop-filter: blur(16px); border: 0.5px solid rgba(255,255,255,0.9); border-radius: 20px; padding: 18px 16px 14px; }
        .summary-top { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; }
        .kcal-left { display: flex; align-items: baseline; gap: 6px; }
        .kcal-num { font-family: 'DM Serif Display', serif; font-size: 36px; color: #7a5a9a; }
        .kcal-label { font-size: 13px; color: #a090b0; }
        .kcal-remain { font-size: 12px; color: #a090b0; }
        .progress-track { height: 6px; background: #f0ebe8; border-radius: 3px; margin-bottom: 16px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #9a7ad8, #c0a0e8); transition: width 0.6s ease; }
        .progress-fill.over { background: linear-gradient(90deg, #e88060, #f0a080); }
        .rings { display: flex; justify-content: space-around; }
        .ring-wrap { display: flex; flex-direction: column; align-items: center; position: relative; }
        .ring-center { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -58%); display: flex; flex-direction: column; align-items: center; }
        .ring-val { font-size: 11px; font-weight: 500; color: #3d2e3d; }
        .ring-label { font-size: 11px; color: #a090b0; margin-top: 4px; }
        .ring-unit { font-size: 10px; color: #c0b0c8; }
        .meal-section { margin: 0 20px 20px; }
        .meal-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .meal-title { font-size: 14px; font-weight: 500; color: #5a4a6a; }
        .meal-count { font-size: 11px; color: #a090b0; background: rgba(122,90,154,0.1); border-radius: 8px; padding: 2px 8px; }
        .empty-meal { font-size: 13px; color: #c0b0c8; padding: 10px 0 4px; font-style: italic; }
        .entry-card { display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.6); backdrop-filter: blur(12px); border: 0.5px solid rgba(255,255,255,0.9); border-radius: 14px; padding: 12px 14px; margin-bottom: 8px; animation: fadeUp 0.25s ease both; }
        .entry-left { display: flex; align-items: flex-start; gap: 10px; }
        .entry-meal-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
        .entry-meal-dot[data-meal="早餐"] { background: #f0b860; }
        .entry-meal-dot[data-meal="午餐"] { background: #60b8f0; }
        .entry-meal-dot[data-meal="晚餐"] { background: #9a7ad8; }
        .entry-meal-dot[data-meal="點心"] { background: #f090a0; }
        .entry-name { font-size: 14px; font-weight: 500; color: #3d2e3d; }
        .entry-macros { font-size: 11px; color: #a090b0; margin-top: 2px; }
        .entry-time { font-size: 11px; color: #c0b0c8; margin-top: 2px; }
        .entry-delete { width: 26px; height: 26px; border-radius: 50%; background: rgba(200,180,200,0.2); border: none; cursor: pointer; font-size: 16px; color: #b0a0b8; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s, color 0.15s; }
        .entry-delete:hover { background: #fce4e4; color: #d06060; }
        .bot-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; padding: 12px 24px 28px; background: linear-gradient(to top, rgba(250,247,245,0.98) 70%, transparent); display: flex; gap: 12px; z-index: 50; }
        .nav-btn { flex: 1; padding: 12px; border-radius: 16px; border: none; cursor: pointer; font-family: 'Noto Sans TC', sans-serif; font-size: 14px; font-weight: 500; transition: all 0.15s; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .nav-btn-ghost { background: rgba(255,255,255,0.6); backdrop-filter: blur(10px); border: 0.5px solid rgba(255,255,255,0.9); color: #7a5a9a; }
        .nav-btn-ghost:hover { background: rgba(255,255,255,0.85); }
        .nav-btn-primary { background: #7a5a9a; color: #fff; }
        .nav-btn-primary:hover { background: #6a4a8a; }
        .modal-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(60,40,80,0.35); backdrop-filter: blur(4px); display: flex; align-items: flex-end; justify-content: center; animation: fadeIn 0.2s ease; }
        .modal-card { width: 100%; max-width: 430px; background: #faf7f5; border-radius: 24px 24px 0 0; padding: 16px 20px 40px; animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); max-height: 90dvh; overflow-y: auto; }
        .modal-handle { width: 36px; height: 4px; border-radius: 2px; background: #d8c8e8; margin: 0 auto 20px; }
        .modal-title { font-family: 'DM Serif Display', serif; font-size: 20px; color: #3d2e3d; margin-bottom: 20px; }
        .field-label { display: block; font-size: 12px; color: #a090b0; font-weight: 500; margin-bottom: 6px; margin-top: 14px; }
        .field-input { width: 100%; background: rgba(255,255,255,0.7); border: 0.5px solid rgba(200,180,220,0.6); border-radius: 12px; padding: 12px 14px; font-family: 'Noto Sans TC', sans-serif; font-size: 15px; color: #3d2e3d; outline: none; transition: border-color 0.15s; }
        .field-input:focus { border-color: #9a7ad8; }
        .meal-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
        .meal-pill { padding: 7px 14px; border-radius: 20px; background: rgba(255,255,255,0.6); border: 0.5px solid rgba(200,180,220,0.5); font-family: 'Noto Sans TC', sans-serif; font-size: 13px; color: #7a5a9a; cursor: pointer; transition: all 0.15s; }
        .meal-pill.active { background: #7a5a9a; color: #fff; border-color: #7a5a9a; }
        .macro-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
        .macro-field { display: flex; flex-direction: column; gap: 4px; }
        .macro-label { font-size: 11px; color: #a090b0; }
        .macro-input { background: rgba(255,255,255,0.7); border: 0.5px solid rgba(200,180,220,0.5); border-radius: 10px; padding: 8px 10px; font-family: 'Noto Sans TC', sans-serif; font-size: 14px; color: #3d2e3d; outline: none; width: 100%; }
        .macro-input:focus { border-color: #9a7ad8; }
        .btn-primary { width: 100%; margin-top: 24px; padding: 14px; border-radius: 16px; border: none; cursor: pointer; background: #7a5a9a; color: #fff; font-family: 'Noto Sans TC', sans-serif; font-size: 15px; font-weight: 500; transition: background 0.15s; }
        .btn-primary:hover:not(:disabled) { background: #6a4a8a; }
        .btn-primary:disabled { background: #c8b8d8; cursor: default; }
        .btn-ghost { width: 100%; margin-top: 10px; padding: 12px; border-radius: 16px; border: none; cursor: pointer; background: transparent; color: #a090b0; font-family: 'Noto Sans TC', sans-serif; font-size: 14px; }
        .btn-ghost:hover { color: #7a5a9a; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>

      <div className="blobs">
        <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      </div>

      <div className="page">
        <div className="hdr">
          <div className="hdr-left">
            <Link href="/" className="back-btn">←</Link>
            <span className="hdr-title">吃吃日記</span>
          </div>
          <button className="add-btn" onClick={() => setShowModal(true)}>+</button>
        </div>

        {/* 日期從左到右（舊→新） */}
        <div className="day-scroll">
          {days.map((d) => {
            const ds = d.toDateString();
            const isToday = ds === new Date().toDateString();
            return (
              <button key={ds} className={`day-chip${activeDay === ds ? " active" : ""}`} onClick={() => setActiveDay(ds)}>
                <span className="day-name">{isToday ? "今天" : d.toLocaleDateString("zh-TW", { weekday: "short" })}</span>
                <span className="day-num">{d.getDate()}</span>
              </button>
            );
          })}
        </div>

        {/* 摘要（任何日期都顯示） */}
        <div className="summary">
          <div className="summary-top">
            <div className="kcal-left">
              <span className="kcal-num">{Math.round(kcalForDisplay)}</span>
              <span className="kcal-label">kcal</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              {isActiveToday && <GoalEditor goal={goal} onSave={saveGoal} />}
              {isActiveToday ? (
                <span className="kcal-remain">
                  {kcalForDisplay >= goal ? `超出 ${Math.round(kcalForDisplay - goal)} kcal` : `還剩 ${Math.round(remaining)} kcal`}
                </span>
              ) : (
                <span className="kcal-remain">目標 {goal} kcal</span>
              )}
            </div>
          </div>
          <div className="progress-track">
            <div className={`progress-fill${kcalForDisplay > goal ? " over" : ""}`}
              style={{ width: `${Math.round(kcalPct * 100)}%` }} />
          </div>
          <div className="rings">
            <MacroRing label="蛋白質" value={dayEntries.reduce((s, e) => s + (e.protein ?? 0), 0)} unit="g" color="#9a7ad8" max={60} />
            <MacroRing label="脂肪" value={dayEntries.reduce((s, e) => s + (e.fat ?? 0), 0)} unit="g" color="#f0a060" max={65} />
            <MacroRing label="碳水" value={dayEntries.reduce((s, e) => s + (e.carbs ?? 0), 0)} unit="g" color="#60c8a0" max={130} />
          </div>
        </div>

        {MEALS.map((m) => {
          const entries = byMeal[m];
          return (
            <div key={m} className="meal-section">
              <div className="meal-header">
                <span>{MEAL_EMOJI[m]}</span>
                <span className="meal-title">{m}</span>
                {entries.length > 0 && <span className="meal-count">{entries.length} 項</span>}
              </div>
              {entries.length === 0 ? (
                <p className="empty-meal">尚無紀錄</p>
              ) : (
                entries.map((e) => <EntryCard key={e.id} entry={e} onDelete={() => removeFoodEntry(e.id)} />)
              )}
            </div>
          );
        })}
      </div>

      {/* 底部導覽 — z-index: 50 確保可點擊 */}
      <div className="bot-nav">
        <Link href="/" className="nav-btn nav-btn-ghost">💬 回到對話</Link>
        <button className="nav-btn nav-btn-primary" onClick={() => setShowModal(true)}>+ 新增食物</button>
      </div>

      {showModal && (
        <AddModal
          onClose={() => setShowModal(false)}
          onAdd={handleAdd}
          targetDate={activeDateObj}
        />
      )}
    </>
  );
}