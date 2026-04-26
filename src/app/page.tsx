"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import {
  getActiveEgg, createEggFromCheat, addEggRecord, applyResourceToEgg,
  getEggEmoji, getAnimalDef, effectivePoints, isEggPaused,
  STAGE_LABELS, MAX_PAUSE_HOURS, onEggChange, Egg, MealType,
  getAllEggs, getCompletedEggs, toggleTask, addPenaltyTasks, replaceEggTasks,
} from "@/lib/eggStore";
import {
  completeTask, getResourceState, onResourceChange,
  COMBO_CONFIG, ResourceState,
} from "@/lib/resourceStore";
import {
  startMealReminderScheduler,
  requestReminderPermission,
  buildReminderPayload,
  getCurrentMealSlot,
} from "@/lib/mealReminder";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  mealType?: MealType | "chat";
};

type DropAnim = { id: string; emoji: string; name: string; rarity: string };

const MSGS_KEY = "potluck-egg-messages";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return "深夜了，還沒休息嗎？請記得紀錄今天的最後一餐。";
  if (h < 10) return "早安。今天第一餐的營養攝取計畫是什麼？";
  if (h < 14) return "午安。該吃午餐了，請確實紀錄你的飲食內容。";
  if (h < 18) return "下午好。如果有補充點心，也請確實紀錄下來。";
  return "晚安。今天的晚餐吃了什麼？請完成今日的飲食紀錄。";
}

function loadMsgs(): Message[] {
  try { const r = localStorage.getItem(MSGS_KEY); if (r) return JSON.parse(r); } catch {}
  return [{ id: "w0", role: "assistant", text: getGreeting() }];
}
function saveMsgs(msgs: Message[]) {
  try { localStorage.setItem(MSGS_KEY, JSON.stringify(msgs.slice(-60))); } catch {}
}

// ── Combo Bar ─────────────────────────────────────────────────────────────────
function ComboBar({ combo }: { combo: number }) {
  const max = COMBO_CONFIG.maxCombo;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: i < combo ? 8 : 4, borderRadius: 4,
          background: i < combo
            ? combo >= max
              ? "linear-gradient(90deg,#f0b020,#f06020)"
              : combo >= 3
              ? "linear-gradient(90deg,#9a7ad8,#c0a0e8)"
              : "linear-gradient(90deg,#7ac840,#a0d860)"
            : "rgba(160,200,100,0.2)",
          transition: "all 0.3s cubic-bezier(.34,1.56,.64,1)",
          boxShadow: i < combo && combo >= max ? "0 0 6px rgba(240,160,32,0.6)" : "none",
        }} />
      ))}
      {combo > 0 && (
        <span style={{
          fontSize: 9, fontWeight: 700, marginLeft: 3,
          color: combo >= max ? "#f06020" : combo >= 3 ? "#9a7ad8" : "#5a9e30",
        }}>
          {combo >= max ? "🔥PEAK" : combo >= 3 ? `⚡×${combo}` : `×${combo}`}
        </span>
      )}
    </div>
  );
}

// ── Drop Toast ────────────────────────────────────────────────────────────────
function DropToast({ drop, onDone }: { drop: DropAnim; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  const isEpic = drop.rarity === "epic";
  const isRare = drop.rarity === "rare";
  return (
    <div style={{
      position: "fixed", top: 70, right: 16, zIndex: 400,
      background: isEpic
        ? "linear-gradient(135deg,#9a7ad8,#e090d8)"
        : isRare ? "linear-gradient(135deg,#60b8f0,#90d8f0)"
        : "rgba(255,255,255,0.95)",
      border: `1.5px solid ${isEpic ? "#c0a0e8" : isRare ? "#80c8f8" : "rgba(200,230,160,0.6)"}`,
      borderRadius: 14, padding: "8px 14px",
      display: "flex", alignItems: "center", gap: 8,
      boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
      animation: "slideIn 0.4s cubic-bezier(.34,1.56,.64,1)",
    }}>
      <span style={{ fontSize: 22 }}>{drop.emoji}</span>
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: isEpic ? "white" : "#3d4a30" }}>{drop.name}</p>
        <p style={{ fontSize: 10, color: isEpic ? "rgba(255,255,255,0.8)" : "#a0b890" }}>
          {isEpic ? "✨ 史詩掉落！" : isRare ? "⭐ 稀有" : "普通素材"}
        </p>
      </div>
    </div>
  );
}

// ── Crit Overlay ──────────────────────────────────────────────────────────────
function CritOverlay({ show, onDone }: { show: boolean; onDone: () => void }) {
  useEffect(() => { if (show) { const t = setTimeout(onDone, 2000); return () => clearTimeout(t); } }, [show, onDone]);
  if (!show) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "linear-gradient(135deg,#9a7ad8,#e090d8)",
        borderRadius: 28, padding: "32px 44px", textAlign: "center",
        animation: "popUp 0.4s cubic-bezier(.34,1.56,.64,1)",
        boxShadow: "0 0 60px rgba(154,122,216,0.5)",
      }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🧬</div>
        <p style={{ fontSize: 20, fontWeight: 700, color: "white" }}>CRITICAL HIT!</p>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>稀有素材爆擊，蛋大幅加速！</p>
      </div>
    </div>
  );
}

// ── Meal Reminder Card ────────────────────────────────────────────────────────
function MealReminderCard() {
  const slot = getCurrentMealSlot();
  if (!slot) return null;
  const payload = buildReminderPayload(slot);
  const slotColors: Record<string, string> = {
    breakfast: "#fef3dc",
    lunch: "#e8f5d0",
    dinner: "#eeedfe",
  };
  return (
    <div style={{
      margin: "0 16px 10px",
      background: slotColors[slot] ?? "#f5f5f5",
      border: "0.5px solid rgba(160,200,100,0.4)",
      borderRadius: 16, padding: "11px 14px",
    }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#3d4a20", marginBottom: 3 }}>
        {payload.title}
      </p>
      <p style={{ fontSize: 12, color: "#5a6a40", lineHeight: 1.6 }}>
        {payload.body}
      </p>
    </div>
  );
}

// ── EggCard ───────────────────────────────────────────────────────────────────
function EggCard({
  egg, combo, onRefresh, onTaskComplete,
}: {
  egg: Egg | null;
  combo: number;
  onRefresh: () => void;
  onTaskComplete: (taskId: string, taskName: string) => void;
}) {
  const taskFileRef = useRef<HTMLInputElement | null>(null);
  const [pendingTask, setPendingTask] = useState<{ id: string; name: string } | null>(null);

  const pts = egg ? effectivePoints(egg) : 0;
  const paused = egg ? isEggPaused(egg) : false;
  const def = egg ? getAnimalDef(egg.defId) : getAnimalDef("shiba");
  const emoji = egg ? getEggEmoji(egg) : "🥚";
  const stage = egg?.stage ?? 0;
  const isComplete = stage === 4;
  const stageColors = ["#f5f0ea", "#fce4d0", "#e8d5f0", "#d5e8f0", "#d5f0e8"];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && pendingTask && egg) {
      toggleTask(egg.id, pendingTask.id, true);
      onTaskComplete(pendingTask.id, pendingTask.name);
      onRefresh();
    }
    setPendingTask(null);
    if (taskFileRef.current) taskFileRef.current.value = "";
  };

  const handleTaskClick = (e: React.MouseEvent, task: Egg["tasks"][0]) => {
    e.preventDefault();
    if (!egg) return;
    if (!task.isCompleted) {
      setPendingTask({ id: task.id, name: task.description });
      taskFileRef.current?.click();
    } else {
      if (confirm(`要取消「${task.description}」的完成狀態嗎？`)) {
        toggleTask(egg.id, task.id, false);
        onRefresh();
      }
    }
  };

  if (!egg) {
    return (
      <div style={cardStyle}>
        <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
          <div style={{ fontSize: 52, marginBottom: 6 }}>🥚</div>
          <p style={{ fontSize: 14, color: "#5a9e30", fontWeight: 500, marginBottom: 3 }}>記錄你的第一餐</p>
          <p style={{ fontSize: 12, color: "#a0c080", lineHeight: 1.6 }}>記錄一筆不健康的飲食<br />就會獲得一顆專屬蛋！</p>
        </div>
      </div>
    );
  }

  const completedCount = egg.tasks.filter(t => t.isCompleted).length;

  return (
    <div style={cardStyle}>
      <input type="file" accept="image/*" ref={taskFileRef} style={{ display: "none" }} onChange={handleFileChange} />
      <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>

        {/* 左側：蛋 + 進度 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 130 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{
              width: 58, height: 58, borderRadius: "50%", flexShrink: 0,
              background: stageColors[stage],
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30,
              boxShadow: paused ? "none" : `0 0 14px ${stageColors[stage]}`,
              filter: paused && !isComplete ? "grayscale(0.5)" : "none",
              animation: isComplete ? "spin 4s linear infinite" : paused ? "none" : "pulse 2.5s ease-in-out infinite",
            }}>
              {emoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#2d4a1e", whiteSpace: "nowrap", marginBottom: 2 }}>
                {stage === 0 ? "神秘的蛋" : def.name}
              </p>
              <p style={{ fontSize: 10, color: "#a0b890", marginBottom: 5 }}>{STAGE_LABELS[stage]}</p>
              {!isComplete && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#b0c8a0", marginBottom: 3 }}>
                    <span>孵化進度</span><span>{Math.round(pts)}%</span>
                  </div>
                  <div style={{ height: 5, background: "rgba(160,200,100,0.15)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 3, transition: "width 1s ease",
                      background: paused
                        ? "linear-gradient(90deg,#c8c8c0,#d8d8d0)"
                        : "linear-gradient(90deg,#7ac840,#b0e860)",
                      width: `${pts}%`,
                    }} />
                  </div>
                </>
              )}
              {isComplete && <p style={{ fontSize: 11, color: "#5a9e30", fontWeight: 500 }}>🎉 孵化完成！</p>}
            </div>
          </div>
          {!isComplete && combo > 0 && <ComboBar combo={combo} />}
        </div>

        {/* 右側：任務清單 */}
        {!isComplete && egg.tasks.length > 0 && (
          <div style={{
            flex: 1.3, background: "rgba(255,255,255,0.5)",
            borderRadius: 12, padding: "8px 10px", display: "flex", flexDirection: "column",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#5a9e30" }}>📝 代謝任務</p>
              <span style={{ fontSize: 9, color: "#88a870", background: "rgba(136,168,112,0.15)", padding: "2px 6px", borderRadius: 8 }}>
                {completedCount}/{egg.tasks.length}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, overflowY: "auto", maxHeight: 90, paddingRight: 2, scrollbarWidth: "none" }}>
              {egg.tasks.map(task => (
                <label key={task.id}
                  style={{ display: "flex", alignItems: "flex-start", gap: 6, cursor: "pointer" }}
                  onClick={e => handleTaskClick(e, task)}
                >
                  <input type="checkbox" readOnly checked={task.isCompleted}
                    style={{ marginTop: 2, accentColor: "#7ac840", transform: "scale(0.9)", pointerEvents: "none" }}
                  />
                  <span style={{
                    fontSize: 11, lineHeight: 1.3, transition: "all 0.2s",
                    color: task.isCompleted ? "#a8c890" : "#2d4a1e",
                    textDecoration: task.isCompleted ? "line-through" : "none",
                  }}>
                    {task.description}
                  </span>
                </label>
              ))}
            </div>
            {completedCount > 0 && completedCount === egg.tasks.length && (
              <p style={{ fontSize: 10, color: "#5a9e30", textAlign: "center", marginTop: 5, fontWeight: 500 }}>
                ✓ 全部完成！素材已注入蛋中
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  margin: "0 16px 12px",
  background: "rgba(255,255,255,0.72)",
  backdropFilter: "blur(16px)",
  border: "0.5px solid rgba(200,230,160,0.5)",
  borderRadius: 20, padding: "14px 16px",
};

// ── ZooCollection ─────────────────────────────────────────────────────────────
function ZooCollection() {
  const eggs = getCompletedEggs();
  if (eggs.length === 0) return null;
  return (
    <div style={{ margin: "0 16px 12px" }}>
      <p style={{ fontSize: 11, color: "#a0b890", marginBottom: 7, fontWeight: 500 }}>已孵化的夥伴</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {eggs.map(egg => (
          <div key={egg.id} style={{
            background: "rgba(255,255,255,0.7)", backdropFilter: "blur(10px)",
            border: "0.5px solid rgba(200,230,160,0.5)", borderRadius: 14,
            padding: "7px 12px", display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 20 }}>{getEggEmoji(egg)}</span>
            <span style={{ fontSize: 11, color: "#5a9e30", fontWeight: 500 }}>{getAnimalDef(egg.defId).name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Background ────────────────────────────────────────────────────────────────
function Background() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
      <svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8f5d0" />
            <stop offset="100%" stopColor="#f5fce8" />
          </linearGradient>
        </defs>
        <rect width="390" height="844" fill="url(#sky)" />
      </svg>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [toast, setToast]           = useState<string | null>(null);
  const [hydrated, setHydrated]     = useState(false);
  
  // 🌟 單一狀態區塊：不會有重複宣告
  const [activeEgg, setActiveEgg]   = useState<Egg | null>(null);
  const [tick, setTick]             = useState(0); 
  const [combo, setCombo]           = useState(0);

  const [lastDrop, setLastDrop]     = useState<DropAnim | null>(null);
  const [showCrit, setShowCrit]     = useState(false);
  const [stageUpMsg, setStageUpMsg] = useState<string | null>(null);
  const [nickname, setNickname]     = useState<string>("");
  const [showLogin, setShowLogin]   = useState(false);

  const msgsEndRef  = useRef<HTMLDivElement>(null);
  const lastSendRef = useRef(0);
  const fileRef     = useRef<HTMLInputElement | null>(null);

  // 🌟 透過 tick 強制 React 更新畫面
  const refreshEgg   = useCallback(() => {
    setActiveEgg(getActiveEgg());
    setTick(t => t + 1);
  }, []);
  
  const refreshCombo = useCallback(() => setCombo(getResourceState().combo.count), []);

  useEffect(() => {
    setMessages(loadMsgs());
    refreshEgg();
    refreshCombo();
    setHydrated(true);
    
    const storedName = localStorage.getItem("buddybite-user");
    if (storedName) {
      setNickname(storedName);
    } else {
      setShowLogin(true);
    }

    const u1 = onEggChange(refreshEgg);
    const u2 = onResourceChange(refreshCombo);
    return () => { u1(); u2(); };
  }, [refreshEgg, refreshCombo]);

  useEffect(() => { if (hydrated) saveMsgs(messages); }, [messages, hydrated]);
  useEffect(() => {
    if (hydrated) setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: "auto" }), 50);
  }, [hydrated, messages]);

  useEffect(() => {
    requestReminderPermission().then(granted => {
      if (granted) startMealReminderScheduler();
    });
  }, []);

  const addMsg = (role: "user" | "assistant", text: string, extras?: Partial<Message>) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role, text, ...extras }]);
  };

  const showToast = (msg: string, ms = 2800) => {
    setToast(msg); setTimeout(() => setToast(null), ms);
  };

  // ── 任務完成 → 掉落 + 注入蛋 ──────────────────────────────────────────────
  const handleTaskComplete = useCallback((taskId: string, taskName: string) => {
    const egg = getActiveEgg();
    if (!egg) return;

    const doneCount = egg.tasks.filter(t => t.isCompleted).length;
    const result = completeTask(doneCount);
    const newCombo = getResourceState().combo.count;
    setCombo(newCombo);

    if (result.totalHatchBonus > 0 || result.totalPenaltyReduce > 0) {
      const eggResult = applyResourceToEgg(result.totalHatchBonus, result.totalPenaltyReduce);
      if (eggResult) {
        refreshEgg();
        if (eggResult.newStage > eggResult.prevStage) {
          const msg = `✨ 蛋升到 ${STAGE_LABELS[eggResult.newStage]}！`;
          setStageUpMsg(msg);
          setTimeout(() => setStageUpMsg(null), 3000);
        }
      }
    }

    if (result.isCrit) setShowCrit(true);

    const topDrop = [...result.drops].sort((a, b) => {
      const o = { epic: 2, rare: 1, common: 0 };
      return o[b.def.rarity as keyof typeof o] - o[a.def.rarity as keyof typeof o];
    })[0];
    if (topDrop) {
      setLastDrop({
        id: crypto.randomUUID(),
        emoji: topDrop.def.emoji,
        name: topDrop.def.name,
        rarity: topDrop.def.rarity,
      });
    }

    const comboLabel = newCombo >= 5 ? " 🔥 PEAK FLOW！" : newCombo >= 3 ? ` ⚡ Combo ×${newCombo}！` : "";
    showToast(`素材掉落${comboLabel}`);
  }, [refreshEgg]);

  // ── 任務照片上傳後的 AI 回應 ───────────────────────────────────────────────
  const handleTaskCompleted = useCallback(async (taskId: string, taskName: string) => {
    handleTaskComplete(taskId, taskName);
    const userMsg = `我完成了任務：「${taskName}」！`;
    addMsg("user", userMsg);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: messages.slice(-6) }),
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const dec = new TextDecoder();
      let acc = "";
      const streamId = crypto.randomUUID();
      setMessages(prev => [...prev, { id: streamId, role: "assistant", text: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages(prev => prev.map(m => m.id === streamId ? { ...m, text: acc } : m));
      }
    } catch {
      addMsg("assistant", "任務完成！素材已注入蛋中。✨");
    } finally {
      setLoading(false);
    }
  }, [handleTaskComplete, messages]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const send = async () => {
    if (!input.trim() || loading) return;
    const now = Date.now();
    if (now - lastSendRef.current < 1000) return;
    lastSendRef.current = now;

    const userText = input.trim();
    setInput("");
    addMsg("user", userText);
    setLoading(true);

    try {
      const egg = getActiveEgg();
      const isFirstRecord = !egg && !getAllEggs().length;
      const historyToSend = messages.slice(-10).map(m => ({ role: m.role, text: m.text }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText,
          history: historyToSend,
          eggStage: egg?.stage ?? 0,
          penaltyDays: egg?.penaltyDays ?? 0,
          totalHealthyMeals: egg?.records.filter(r => r.type === "healthy").length ?? 0,
          isFirstRecord,
        }),
      });

      let mealType: "healthy" | "cheat" | "tip" | "chat" =
        (res.headers.get("X-Meal-Type") as any) ?? "chat";
      const foodLabel = decodeURIComponent(res.headers.get("X-Food-Label") ?? userText.slice(0, 20));
      const rawTasks = res.headers.get("X-Tasks");
      const aiTasks: string[] = rawTasks ? JSON.parse(decodeURIComponent(rawTasks)) : [];

      // 🌟 前端再次強制攔截！只要有任務陣列，必定是不健康的零食！
      if (aiTasks.length > 0) {
        mealType = "cheat";
      } else if (mealType === "chat") {
        if (["不健康","cheat","炸","甜","零食","垃圾","餅乾"].some(k => userText.toLowerCase().includes(k))) mealType = "cheat";
        else if (["健康","菜","沙拉","水果","水煮","雞胸"].some(k => userText.includes(k))) mealType = "healthy";
      }

      // 更新蛋
      if (mealType !== "chat") {
        const currentEgg = getActiveEgg();
        if (!currentEgg) {
          // 第一顆蛋
          createEggFromCheat(foodLabel, aiTasks);
          refreshEgg();
          showToast("🥚 代謝蛋誕生了！");
        } else {
          const result = addEggRecord(mealType as MealType, foodLabel);
          if (result) {
            if (mealType === "cheat") {
              if (aiTasks.length > 0) {
                replaceEggTasks(currentEgg.id, aiTasks);
                showToast("🍕 記錄了，任務已更新");
              } else {
                addPenaltyTasks(currentEgg.id);
                showToast("🍕 記錄了，多了兩個小任務");
              }
            } else if (mealType === "healthy") {
              if (result.newStage > result.prevStage) {
                const msg = `✨ 蛋升到 ${STAGE_LABELS[result.newStage]}！`;
                setStageUpMsg(msg);
                setTimeout(() => setStageUpMsg(null), 3000);
              } else {
                showToast(`🥗 健康加速 +${Math.round(result.delta)}%`);
              }
            }
            refreshEgg();
          }
        }
      }

      // Stream 回應
      const streamId = crypto.randomUUID();
      setMessages(prev => [...prev, { id: streamId, role: "assistant", text: "", mealType }]);
      setLoading(false);

      const reader = res.body?.getReader();
      if (!reader) return;
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages(prev => prev.map(m => m.id === streamId ? { ...m, text: acc } : m));
      }

    } catch {
      addMsg("assistant", "出了點問題，請再試一次。");
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (file: File) => {
    addMsg("user", `［上傳了照片：${file.name}］`);
    setLoading(true);
    try {
      const f = new FormData(); f.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: f });
      const data = await res.json();
      addMsg("assistant", data.analysis ?? "我看到你的食物了！跟我說一下是什麼吧？");
    } catch { addMsg("assistant", "照片沒有成功傳到，再試試看？"); }
    finally { setLoading(false); }
  };

  const quickActions = [
    { label: "我吃了健康的 🥗", text: "我剛吃了健康的東西" },
    { label: "cheat day 🍕",    text: "我吃了不健康的東西" },
    { label: "我喝了水 💧",     text: "我吃完垃圾食物後有喝水補充" },
    { label: "去散步了 🚶",     text: "我吃完後去散步了二十分鐘" },
  ];

  if (!hydrated) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500&family=DM+Serif+Display:ital@0;1&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }
        body { font-family: 'Noto Sans TC', sans-serif; background: #e8f5d0; }
        .root { position: relative; width: 100%; height: 100dvh; display: flex; flex-direction: column; align-items: center; }
        .topbar { position: relative; z-index: 10; width: 100%; max-width: 480px; padding: 50px 18px 10px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .title { font-family: 'DM Serif Display', serif; font-size: 22px; color: #2d4a1e; }
        .sub { font-size: 11px; color: #88a870; margin-top: 2px; }
        .nav-link { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 20px; background: rgba(255,255,255,0.75); border: 0.5px solid rgba(160,210,100,0.5); font-size: 11px; font-weight: 500; text-decoration: none; color: #5a9e30; backdrop-filter: blur(8px); }
        .chat-wrap { position: relative; z-index: 10; width: calc(100% - 32px); max-width: 448px; flex: 1; display: flex; flex-direction: column; margin-bottom: 10px; min-height: 0; background: rgba(255,255,255,0.72); backdrop-filter: blur(18px); border-radius: 24px; border: 0.5px solid rgba(200,230,160,0.5); box-shadow: 0 8px 40px rgba(90,158,48,0.12); overflow: hidden; }
        .msgs { flex: 1; overflow-y: auto; padding: 12px 16px 6px; display: flex; flex-direction: column; gap: 10px; scrollbar-width: none; min-height: 0; }
        .msgs::-webkit-scrollbar { display: none; }
        .row-bot { display: flex; flex-direction: column; align-items: flex-start; width: 100%; gap: 6px; }
        .row-user { display: flex; flex-direction: column; align-items: flex-end; }
        .bubble-bot { max-width: 100%; background: rgba(255,255,255,0.9); border: 0.5px solid rgba(200,230,160,0.8); border-radius: 4px 18px 18px 18px; padding: 10px 14px; color: #2d4a1e; font-size: 14px; line-height: 1.65; animation: fadeUp 0.3s ease both; }
        .bubble-bot p { margin-bottom: 5px; } .bubble-bot p:last-child { margin-bottom: 0; }
        .bubble-user { max-width: 78%; background: rgba(90,158,48,0.13); border-radius: 18px 4px 18px 18px; padding: 10px 14px; color: #2d4a1e; font-size: 14px; line-height: 1.55; animation: fadeUp 0.25s ease both; }
        .typing { display: flex; gap: 5px; padding: 10px 14px; background: rgba(255,255,255,0.9); border: 0.5px solid rgba(200,230,160,0.6); border-radius: 4px 18px 18px 18px; width: fit-content; }
        .typing span { width: 6px; height: 6px; border-radius: 50%; background: #90c860; animation: bounce 1.2s infinite; }
        .typing span:nth-child(2) { animation-delay: 0.2s; } .typing span:nth-child(3) { animation-delay: 0.4s; }
        .bottom { flex-shrink: 0; padding: 6px 12px 10px; }
        .quick-row { display: flex; gap: 5px; margin-bottom: 7px; overflow-x: auto; scrollbar-width: none; }
        .quick-row::-webkit-scrollbar { display: none; }
        .quick-btn { flex-shrink: 0; padding: 5px 11px; border-radius: 16px; background: rgba(255,255,255,0.8); border: 0.5px solid rgba(160,210,100,0.4); font-family: 'Noto Sans TC', sans-serif; font-size: 11px; color: #5a9e30; cursor: pointer; white-space: nowrap; }
        .quick-btn:hover { background: rgba(220,245,190,0.8); }
        .input-row { display: flex; align-items: flex-end; gap: 8px; background: rgba(255,255,255,0.9); border: 0.5px solid rgba(160,210,100,0.5); border-radius: 20px; padding: 8px 8px 8px 14px; }
        .inp { flex: 1; border: none; background: transparent; outline: none; font-family: 'Noto Sans TC', sans-serif; font-size: 14px; color: #2d4a1e; resize: none; min-height: 20px; max-height: 80px; line-height: 1.5; }
        .inp::placeholder { color: #a8c890; }
        .send-btn { width: 34px; height: 34px; border-radius: 50%; background: #5a9e30; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .send-btn:hover:not(:disabled) { background: #4a8e20; }
        .send-btn:disabled { background: #b8d8a0; cursor: default; }
        .toast { position: fixed; top: 18px; left: 50%; transform: translateX(-50%); background: rgba(45,74,30,0.9); color: #fff; padding: 9px 18px; border-radius: 20px; font-size: 13px; z-index: 300; backdrop-filter: blur(10px); animation: fadeUp 0.3s ease; white-space: nowrap; }
        .stage-banner { position: fixed; top: 58px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg,#5a9e30,#90d860); color: white; padding: 9px 22px; border-radius: 20px; font-size: 14px; font-weight: 600; z-index: 200; animation: popUp 0.4s cubic-bezier(.34,1.56,.64,1); white-space: nowrap; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0);opacity:.5} 40%{transform:translateY(-4px);opacity:1} }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes popUp { from{transform:translateX(-50%) scale(0.7);opacity:0} to{transform:translateX(-50%) scale(1);opacity:1} }
        @keyframes slideIn { from{transform:translateX(40px);opacity:0} to{transform:translateX(0);opacity:1} }
      `}</style>

      <Background />
      {toast && <div className="toast">{toast}</div>}
      {stageUpMsg && <div className="stage-banner">{stageUpMsg}</div>}
      {lastDrop && <DropToast drop={lastDrop} onDone={() => setLastDrop(null)} />}
      <CritOverlay show={showCrit} onDone={() => setShowCrit(false)} />

      {/* 🌟 選項 B：輕量化輸入暱稱的彈出視窗 */}
      {showLogin && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(5px)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{
            background: "#fff", padding: "30px", borderRadius: "24px",
            width: "90%", maxWidth: "340px", textAlign: "center",
            boxShadow: "0 10px 40px rgba(0,0,0,0.2)"
          }}>
            <h2 style={{ color: "#2d4a1e", marginBottom: "10px" }}>歡迎來到 BuddyBite</h2>
            <p style={{ color: "#5a6a40", fontSize: "14px", marginBottom: "20px" }}>請輸入你的專屬暱稱，讓我們為你建立資料庫。</p>
            <input 
              autoFocus
              maxLength={15}
              placeholder="例如：小餅乾"
              style={{
                width: "100%", padding: "12px", borderRadius: "12px",
                border: "1px solid #c0d8a0", marginBottom: "20px",
                fontSize: "16px", textAlign: "center", outline: "none"
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  localStorage.setItem("buddybite-user", e.currentTarget.value.trim());
                  setNickname(e.currentTarget.value.trim());
                  setShowLogin(false);
                }
              }}
            />
            <button 
              onClick={(e) => {
                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                if (input.value.trim()) {
                  localStorage.setItem("buddybite-user", input.value.trim());
                  setNickname(input.value.trim());
                  setShowLogin(false);
                }
              }}
              style={{
                background: "#5a9e30", color: "#fff", border: "none",
                padding: "12px 24px", borderRadius: "12px", fontSize: "16px",
                fontWeight: "bold", cursor: "pointer", width: "100%"
              }}
            >
              開始體驗 🥚
            </button>
          </div>
        </div>
      )}

      <div className="root">
        <div className="topbar" style={{ maxWidth: 480 }}>
          <div>
            <div className="title">BuddyBite 🥚</div>
            <div className="sub">{nickname ? `${nickname} 的隨身顧問` : "你的隨身營養顧問"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => {
              localStorage.removeItem("potluck-egg-messages");
              localStorage.removeItem("potluck-egg-state");
              localStorage.removeItem("buddybite-resources");
              localStorage.removeItem("buddybite-user"); // 清除時順便清掉暱稱
              window.location.reload();
            }} style={{
              background: "#ff4757", color: "white", border: "none",
              padding: "6px 10px", borderRadius: 12, fontSize: 11,
              fontWeight: "bold", cursor: "pointer",
            }}>
              💣 清除
            </button>
            <Link href="/zoo" className="nav-link">🦎 動物園</Link>
          </div>
        </div>

        <MealReminderCard />
        <EggCard
          egg={activeEgg}
          combo={combo}
          onRefresh={refreshEgg}
          onTaskComplete={handleTaskCompleted}
        />
        <ZooCollection />

        <div className="chat-wrap">
          <div className="msgs">
            {messages.map(msg => {
              // ── 1. 使用者訊息 ──
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="row-user">
                    <div className="bubble-user">{msg.text}</div>
                  </div>
                );
              }

              // ── 2. AI 訊息：攔截並嘗試解析 JSON ──
              let parsedData = null;
              try {
                parsedData = JSON.parse(msg.text);
              } catch (e) {
                // 解析失敗（一般文字或串流中）
              }

              // 🍔 餐點推薦卡片
              if (parsedData?.foodRecommendation) {
                const data = parsedData.foodRecommendation;
                return (
                  <div key={msg.id} className="row-bot">
                    <div className="bubble-bot" style={{ padding: "14px", width: "100%" }}>
                      <p style={{ fontSize: 13, marginBottom: 12, fontWeight: 600, color: "#2d4a1e" }}>{data.intro}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {data.items?.map((item: any, idx: number) => (
                          <div key={idx} style={{ background: "rgba(160,200,100,0.15)", padding: 12, borderRadius: 14 }}>
                            <div style={{ fontWeight: 700, color: "#5a9e30", fontSize: 14 }}>{item.name}</div>
                            <div style={{ fontSize: 12, color: "#5a6a40", marginTop: 6, lineHeight: 1.5 }}>{item.description}</div>
                            <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 11, color: "#6a8a50" }}>
                              <span style={{ background: "rgba(255,255,255,0.8)", padding: "3px 8px", borderRadius: 8 }}>🔥 {item.calories} 大卡</span>
                              <span style={{ background: "rgba(255,255,255,0.8)", padding: "3px 8px", borderRadius: 8 }}>💰 ${item.price}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              // 🧋 飲品推薦卡片
              if (parsedData?.drinkRecommendation) {
                const data = parsedData.drinkRecommendation;
                return (
                  <div key={msg.id} className="row-bot">
                    <div className="bubble-bot" style={{ padding: "14px", width: "100%" }}>
                      <p style={{ fontSize: 13, marginBottom: 12, fontWeight: 600, color: "#2d4a1e" }}>{data.intro}</p>
                      {data.healthy_tip && (
                        <div style={{ background: "#fef3dc", border: "1px solid rgba(220,180,100,0.3)", color: "#8a6a20", padding: 10, borderRadius: 12, fontSize: 12, marginTop: 10 }}>
                          💡 {data.healthy_tip}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // 🍽️ 餐廳推薦卡片
              if (parsedData?.restaurantCards) {
                const data = parsedData.restaurantCards;
                return (
                  <div key={msg.id} className="row-bot">
                    <div className="bubble-bot" style={{ padding: "14px", width: "100%" }}>
                      <p style={{ fontSize: 13, marginBottom: 12, fontWeight: 600, color: "#2d4a1e" }}>{data.intro}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {data.restaurants?.map((rest: any, idx: number) => (
                          <div key={idx} style={{ background: "rgba(160,200,100,0.15)", padding: 12, borderRadius: 14 }}>
                            <div style={{ fontWeight: 700, color: "#5a9e30", fontSize: 14 }}>🍽️ {rest.name}</div>
                            {rest.recommendations?.map((rec: any, rIdx: number) => (
                              <div key={rIdx} style={{ fontSize: 12, color: "#5a6a40", marginTop: 6 }}>
                                推薦：{rec.item} <span style={{ opacity: 0.7 }}>({rec.calories} 大卡)</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      {data.budget_tip && (
                        <div style={{ background: "#e8f5d0", color: "#5a9e30", padding: 10, borderRadius: 12, fontSize: 12, marginTop: 10 }}>
                          💰 {data.budget_tip}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // ── 3. 一般文字對話 ──
              return (
                <div key={msg.id} className="row-bot">
                  {msg.text.split(/\n+/).filter(t => t.trim()).map((p, i) => (
                    <div key={i} className="bubble-bot">
                      <ReactMarkdown rehypePlugins={[rehypeRaw]}>{p}</ReactMarkdown>
                    </div>
                  ))}
                </div>
              );
            })}
            
            {loading && <div className="row-bot"><div className="typing"><span /><span /><span /></div></div>}
            <div ref={msgsEndRef} />
          </div>

          <div className="bottom">
            <div className="quick-row">
              {quickActions.map(a => (
                <button key={a.label} className="quick-btn" onClick={() => {
                  setInput(a.text);
                  setTimeout(() => (document.querySelector(".inp") as HTMLTextAreaElement)?.focus(), 50);
                }}>{a.label}</button>
              ))}
              <button className="quick-btn" style={{ color: "#c08060", borderColor: "rgba(200,140,80,0.4)" }}
                onClick={() => fileRef.current?.click()}>📷 拍照</button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
            </div>
            <div className="input-row">
              <textarea className="inp"
                placeholder="請輸入你的飲食內容，讓我幫你檢視..."
                value={input} rows={1}
                onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                onKeyDown={e => {
                  if (e.keyCode === 229 || e.nativeEvent.isComposing) return;
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
              />
              <button className="send-btn" onClick={send} disabled={loading || !input.trim()}>
                <svg viewBox="0 0 24 24" fill="white" width="13" height="13">
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}