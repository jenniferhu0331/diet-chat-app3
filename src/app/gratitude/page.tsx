"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GratitudeEntry, getGratitudeLog, getTodayGratitude, saveGratitude } from "@/lib/gratitudeStore";

export default function GratitudePage() {
  const [log, setLog] = useState<GratitudeEntry[]>([]);
  const [todayEntry, setTodayEntry] = useState<GratitudeEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<[string, string, string]>(["", "", ""]);

  function refresh() {
    const all = getGratitudeLog().slice().reverse();
    setLog(all);
    const today = getTodayGratitude();
    setTodayEntry(today);
    if (!today) setEditing(true);
  }

  useEffect(() => { refresh(); }, []);

  function handleSave() {
    if (!items[0].trim()) return;
    const filled: [string, string, string] = [
      items[0].trim(),
      items[1].trim() || "—",
      items[2].trim() || "—",
    ];
    saveGratitude(filled);
    setEditing(false);
    refresh();
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500&family=DM+Serif+Display:ital@0;1&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { min-height: 100dvh; }
        body { font-family: 'Noto Sans TC', sans-serif; background: #faf7f5; color: #3d2e3d; }
        .blobs { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
        .blob { position: absolute; border-radius: 50%; filter: blur(70px); }
        .b1 { width: 280px; height: 280px; background: radial-gradient(#fce4d0, transparent 70%); top: -60px; right: -60px; }
        .b2 { width: 220px; height: 220px; background: radial-gradient(#e8d5f0, transparent 70%); bottom: 10%; left: -50px; }
        .page { position: relative; z-index: 1; max-width: 430px; margin: 0 auto; padding: 0 0 40px; min-height: 100dvh; }
        .hdr { padding: 52px 20px 20px; display: flex; align-items: center; justify-content: space-between; }
        .hdr-left { display: flex; align-items: center; gap: 12px; }
        .back-btn { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,0.7); border: 0.5px solid rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; font-size: 16px; color: #5a4a5a; text-decoration: none; backdrop-filter: blur(10px); }
        .hdr-title { font-family: 'DM Serif Display', serif; font-size: 22px; color: #3d2e3d; }

        /* Today card */
        .today-card { margin: 0 20px 24px; background: rgba(255,255,255,0.65); backdrop-filter: blur(16px); border: 0.5px solid rgba(255,255,255,0.9); border-radius: 20px; padding: 20px; }
        .today-label { font-size: 12px; color: #a090b0; font-weight: 500; margin-bottom: 12px; }
        .gratitude-item { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
        .gratitude-num { width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #f0b860, #f090a0); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; color: #fff; flex-shrink: 0; margin-top: 1px; }
        .gratitude-text { font-size: 14px; color: #3d2e3d; line-height: 1.55; flex: 1; }

        /* Input */
        .input-item { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
        .gratitude-input { flex: 1; background: rgba(255,255,255,0.7); border: 0.5px solid rgba(200,180,220,0.6); border-radius: 12px; padding: 10px 14px; font-family: 'Noto Sans TC', sans-serif; font-size: 14px; color: #3d2e3d; outline: none; }
        .gratitude-input:focus { border-color: #9a7ad8; }
        .gratitude-input::placeholder { color: #c0b0c8; }
        .save-btn { width: 100%; margin-top: 12px; padding: 13px; border-radius: 16px; border: none; cursor: pointer; background: #7a5a9a; color: #fff; font-family: 'Noto Sans TC', sans-serif; font-size: 15px; font-weight: 500; transition: background 0.15s; }
        .save-btn:hover:not(:disabled) { background: #6a4a8a; }
        .save-btn:disabled { background: #c8b8d8; cursor: default; }
        .edit-btn { font-size: 12px; color: #a090b0; background: none; border: none; cursor: pointer; padding: 0; }
        .edit-btn:hover { color: #7a5a9a; }

        /* Empty state */
        .empty-prompt { font-size: 14px; color: #a090b0; line-height: 1.6; margin-bottom: 16px; }

        /* History */
        .section-title { font-size: 13px; font-weight: 500; color: #a090b0; margin: 0 20px 12px; }
        .history-card { margin: 0 20px 12px; background: rgba(255,255,255,0.55); backdrop-filter: blur(12px); border: 0.5px solid rgba(255,255,255,0.9); border-radius: 16px; padding: 14px 16px; }
        .history-date { font-size: 11px; color: #c0b0c8; margin-bottom: 8px; }
        .history-item { font-size: 13px; color: #5a4a6a; margin-bottom: 4px; display: flex; gap: 8px; }
        .history-dot { color: #f0b860; flex-shrink: 0; }

        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="blobs">
        <div className="blob b1" /><div className="blob b2" />
      </div>

      <div className="page">
        <div className="hdr">
          <div className="hdr-left">
            <Link href="/" className="back-btn">←</Link>
            <span className="hdr-title">感恩小記 🌸</span>
          </div>
        </div>

        {/* 今天的記錄 */}
        <div className="today-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span className="today-label">今天的三件小事</span>
            {todayEntry && !editing && (
              <button className="edit-btn" onClick={() => {
                setItems(todayEntry.items);
                setEditing(true);
              }}>✎ 修改</button>
            )}
          </div>

          {editing ? (
            <>
              <p className="empty-prompt">今天有哪三件讓你感到開心、感謝或滿足的事？</p>
              {([0, 1, 2] as const).map((i) => (
                <div key={i} className="input-item">
                  <div className="gratitude-num">{i + 1}</div>
                  <input
                    className="gratitude-input"
                    placeholder={i === 0 ? "一定要填的第一件事…" : `第 ${i + 1} 件事（選填）`}
                    value={items[i]}
                    onChange={(e) => {
                      const next = [...items] as [string, string, string];
                      next[i] = e.target.value;
                      setItems(next);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                  />
                </div>
              ))}
              <button className="save-btn" onClick={handleSave} disabled={!items[0].trim()}>
                記錄下來 ✨
              </button>
            </>
          ) : todayEntry ? (
            todayEntry.items.map((item, i) => (
              item !== "—" && (
                <div key={i} className="gratitude-item">
                  <div className="gratitude-num">{i + 1}</div>
                  <span className="gratitude-text">{item}</span>
                </div>
              )
            ))
          ) : null}
        </div>

        {/* 歷史紀錄 */}
        {log.filter((e) => e.date !== today).length > 0 && (
          <>
            <p className="section-title">過去的小事</p>
            {log.filter((e) => e.date !== today).map((entry) => (
              <div key={entry.id} className="history-card">
                <p className="history-date">
                  {new Date(entry.date).toLocaleDateString("zh-TW", { month: "long", day: "numeric", weekday: "short" })}
                </p>
                {entry.items.filter((i) => i !== "—").map((item, j) => (
                  <div key={j} className="history-item">
                    <span className="history-dot">🌸</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}