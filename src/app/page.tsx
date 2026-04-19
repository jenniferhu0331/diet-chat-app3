"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { addFoodEntry } from "@/lib/foodStore";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  detectedFoods?: string[];
  restaurantCards?: RestaurantCardsData;
};

type RestaurantRecommendation = {
  item: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  price: number;
};

type RestaurantCard = {
  name: string;
  mapsUrl: string;
  rating: number;
  isOpen: boolean;
  walkingMinutes: number;
  recommendations: RestaurantRecommendation[];
};

type RestaurantCardsData = {
  intro: string;
  budget_tip: string;
  special_tip: string;
  restaurants: RestaurantCard[];
};

const MESSAGES_KEY = "diet-chat-messages";

const getGreetingByTime = () => {
  const hour = new Date().getHours();
  if (hour < 3) return "哇！你還沒睡喔 在看劇嗎 還是功課很多";
  if (hour < 8) return "唉呦 今天很早起喔 吃早餐了嗎？要幫你找嗎";
  if (hour < 10) return "早安～想吃什麼？我也可以幫你找附近還有開的店";
  if (hour < 17) return "嗨，午安～今天想吃點什麼？我可以幫你找附近的選擇。";
  return "嗨，晚安～今天想吃什麼？我也可以幫你找附近還有開的店。";
};

function loadMessages(): Message[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (raw) return JSON.parse(raw) as Message[];
  } catch {}
  return [{ id: "welcome-message", role: "assistant", text: getGreetingByTime() }];
}

function saveMessages(msgs: Message[]) {
  try {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs.slice(-60)));
  } catch {}
}

function currentMeal(): "早餐" | "午餐" | "晚餐" | "點心" {
  const h = new Date().getHours();
  if (h < 10) return "早餐";
  if (h < 14) return "午餐";
  if (h < 20) return "晚餐";
  return "點心";
}

function detectFoodsInMessage(text: string): string[] {
  const pattern = /(?:吃了?|點了?|喝了?|來了?|有吃?|吃過?|吃到?)[了一]?\s*([^\s,，。！？、\d]{2,12})/g;
  const found = new Set<string>();
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const raw = m[1].replace(/[了嗎呢啊喔唷哦！？。，、\s]/g, "").trim();
    if (raw.length >= 2) found.add(raw);
  }
  return [...found];
}

function FoodChips({ foods, onSave }: { foods: string[]; onSave: (f: string) => Promise<void> }) {
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());

  async function save(f: string) {
    setSaving((s) => new Set(s).add(f));
    await onSave(f);
    setSaving((s) => { const n = new Set(s); n.delete(f); return n; });
    setSaved((s) => new Set(s).add(f));
  }

  if (foods.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
      {foods.map((f) => (
        <button key={f} onClick={() => save(f)} disabled={saved.has(f) || saving.has(f)}
          style={{
            padding: "4px 12px", borderRadius: 20,
            border: "0.5px solid rgba(200,180,220,0.6)",
            background: saved.has(f) ? "rgba(122,90,154,0.1)" : "rgba(255,255,255,0.7)",
            backdropFilter: "blur(10px)",
            color: saved.has(f) ? "#b0a0c8" : "#7a5a9a",
            fontSize: 12,
            cursor: (saved.has(f) || saving.has(f)) ? "default" : "pointer",
            fontFamily: "inherit", transition: "all 0.15s",
          }}>
          {saved.has(f) ? "✓" : saving.has(f) ? "估算中…" : "+"} {f}
        </button>
      ))}
      {foods.some((f) => !saved.has(f) && !saving.has(f)) && (
        <span style={{ fontSize: 10, color: "#c0b0c8" }}>點擊記錄到日記</span>
      )}
    </div>
  );
}

// ── Restaurant Cards ──────────────────────────────────────────────────────────
function RestaurantCards({ data, onSaveFood }: { data: RestaurantCardsData; onSaveFood: (name: string, rec: RestaurantRecommendation) => Promise<void> }) {
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());

  async function saveRec(restaurantName: string, rec: RestaurantRecommendation) {
    const key = `${restaurantName}__${rec.item}`;
    setSaving((s) => new Set(s).add(key));
    await onSaveFood(restaurantName, rec);
    setSaving((s) => { const n = new Set(s); n.delete(key); return n; });
    setSaved((s) => new Set(s).add(key));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
      {/* intro */}
      <p style={{ fontSize: 14, color: "#3d2e3d", lineHeight: 1.6 }}>{data.intro}</p>

      {/* tips */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {data.budget_tip && (
          <p style={{ fontSize: 12, color: "#7a5a9a", background: "rgba(122,90,154,0.07)", borderRadius: 10, padding: "6px 10px" }}>
            💰 {data.budget_tip}
          </p>
        )}
        {data.special_tip && (
          <p style={{ fontSize: 12, color: "#c08060", background: "rgba(240,160,96,0.08)", borderRadius: 10, padding: "6px 10px" }}>
            ✨ {data.special_tip}
          </p>
        )}
      </div>

      {/* restaurant cards */}
      {data.restaurants.map((r, i) => (
        <div key={i} style={{
          background: "rgba(255,255,255,0.7)", backdropFilter: "blur(14px)",
          border: "0.5px solid rgba(255,255,255,0.95)", borderRadius: 16,
          padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8,
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <a href={r.mapsUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 15, fontWeight: 500, color: "#3d2e3d", textDecoration: "none", borderBottom: "1px solid rgba(122,90,154,0.3)" }}>
              {r.name}
            </a>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: r.isOpen ? "#60b880" : "#b0a0b8" }}>
                {r.isOpen ? "🟢 營業中" : "⚪ 未確認"}
              </span>
            </div>
          </div>

          {/* meta row */}
          <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#a090b0" }}>
            {r.rating && <span>⭐ {r.rating}</span>}
            <span>🚶 約 {r.walkingMinutes} 分鐘</span>
          </div>

          {/* recommendations */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {r.recommendations.map((rec, j) => {
              const key = `${r.name}__${rec.item}`;
              const isSaved = saved.has(key);
              const isSaving = saving.has(key);
              return (
                <div key={j} style={{
                  background: "rgba(122,90,154,0.05)", borderRadius: 10,
                  padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#3d2e3d" }}>🥗 {rec.item}</span>
                    <button onClick={() => saveRec(r.name, rec)} disabled={isSaved || isSaving}
                      style={{
                        padding: "3px 10px", borderRadius: 14, fontSize: 11,
                        border: "0.5px solid rgba(122,90,154,0.3)",
                        background: isSaved ? "rgba(122,90,154,0.1)" : "rgba(255,255,255,0.8)",
                        color: isSaved ? "#b0a0c8" : "#7a5a9a",
                        cursor: isSaved || isSaving ? "default" : "pointer",
                        fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap",
                      }}>
                      {isSaved ? "✓ 已記錄" : isSaving ? "記錄中…" : "+ 記錄"}
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#a090b0", flexWrap: "wrap" }}>
                    <span>🔥 {rec.calories} kcal</span>
                    <span>蛋白 {rec.protein}g</span>
                    <span>脂 {rec.fat}g</span>
                    <span>碳 {rec.carbs}g</span>
                    {rec.price > 0 && <span>💰 約 {rec.price} 元</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSendTimeRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const latRef = useRef<number | null>(null);
  const lngRef = useRef<number | null>(null);

  useEffect(() => {
    setMessages(loadMessages());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveMessages(messages);
  }, [messages, hydrated]);

  useEffect(() => {
    if (hydrated) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), 50);
  }, [hydrated]);

  const addMessage = (role: "user" | "assistant", text: string, detectedFoods?: string[], restaurantCards?: RestaurantCardsData) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, text, detectedFoods, restaurantCards }]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const getLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latRef.current = pos.coords.latitude;
        lngRef.current = pos.coords.longitude;
        setLocationReady(true);
        addMessage("assistant", "收到你的位置了，之後如果你想找附近的店，我可以直接幫你查。");
      },
      (err) => {
        addMessage("assistant", "我這邊沒有拿到定位，不過你還是可以先跟我聊天。");
        alert("定位失敗：" + err.message);
      }
    );
  };

  const saveFood = async (foodName: string) => {
    setToast(`正在估算「${foodName}」的營養…`);
    try {
      const res = await fetch("/api/nutrition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodName }),
      });
      const data = await res.json();
      if (data.calories !== undefined) {
        addFoodEntry({ name: foodName, meal: currentMeal(), source: "chat", calories: data.calories, protein: data.protein, fat: data.fat, carbs: data.carbs });
        setToast(`✓ ${foodName} — ${data.calories} kcal 已記錄`);
      } else {
        addFoodEntry({ name: foodName, meal: currentMeal(), source: "chat" });
        setToast(`✓ 已記錄「${foodName}」`);
      }
    } catch {
      addFoodEntry({ name: foodName, meal: currentMeal(), source: "chat" });
      setToast(`✓ 已記錄「${foodName}」`);
    }
    setTimeout(() => setToast(null), 3000);
  };

  const saveRestaurantFood = async (restaurantName: string, rec: RestaurantRecommendation) => {
    addFoodEntry({
      name: `${rec.item}（${restaurantName}）`,
      meal: currentMeal(),
      source: "chat",
      calories: rec.calories,
      protein: rec.protein,
      fat: rec.fat,
      carbs: rec.carbs,
    });
    setToast(`✓ ${rec.item} — ${rec.calories} kcal 已記錄`);
    setTimeout(() => setToast(null), 3000);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const now = Date.now();
    if (now - lastSendTimeRef.current < 1200) return;
    lastSendTimeRef.current = now;

    const userText = input.trim();
    const historyToSend = [...messages];
    const foods = detectFoodsInMessage(userText);

    setInput("");
    addMessage("user", userText, foods);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, lat: latRef.current, lng: lngRef.current, history: historyToSend }),
      });
      const data = await res.json();

      if (data.restaurantCards) {
        addMessage("assistant", "", undefined, data.restaurantCards);
      } else if (data.parts && Array.isArray(data.parts)) {
        for (const part of data.parts) {
          if (part?.text) addMessage("assistant", part.text);
        }
      } else if (data.reply) {
        addMessage("assistant", data.reply);
      } else if (data.error) {
        addMessage("assistant", `發生錯誤：${data.error}`);
      } else {
        addMessage("assistant", "我剛剛沒有順利回覆耶。");
      }
    } catch {
      addMessage("assistant", "剛剛出了點問題，你可以再試一次。");
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    addMessage("user", `［上傳了一張圖片：${file.name}］`);
    setLoading(true);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.analysis) addMessage("assistant", data.analysis);
      else if (data.error) addMessage("assistant", `圖片處理失敗：${data.error}`);
      else addMessage("assistant", "我有收到圖片，但暫時沒辦法分析。");
    } catch {
      addMessage("assistant", "圖片上傳失敗了，等等再試一次看看。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500&family=DM+Serif+Display:ital@0;1&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }
        body { font-family: 'Noto Sans TC', sans-serif; background: #faf7f5; }
        .blobs { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
        .blob { position: absolute; border-radius: 50%; filter: blur(70px); }
        .b1 { width: 300px; height: 300px; background: radial-gradient(#e8d5f0, transparent 70%); top: -80px; right: -80px; }
        .b2 { width: 240px; height: 240px; background: radial-gradient(#fce4d0, transparent 70%); bottom: 10%; left: -60px; }
        .b3 { width: 180px; height: 180px; background: radial-gradient(#d5e8f0, transparent 70%); top: 45%; right: -40px; }
        .shell { position: relative; z-index: 1; max-width: 480px; margin: 0 auto; height: 100dvh; display: flex; flex-direction: column; }
        .hdr { padding: 52px 20px 14px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .hdr-left { display: flex; flex-direction: column; gap: 2px; }
        .hdr-title { font-family: 'DM Serif Display', serif; font-size: 22px; color: #3d2e3d; }
        .hdr-sub { font-size: 12px; color: #b0a0c0; }
        .diary-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 20px; background: rgba(122,90,154,0.1); border: 0.5px solid rgba(122,90,154,0.2); font-size: 13px; color: #7a5a9a; font-weight: 500; text-decoration: none; transition: background 0.15s; }
        .diary-btn:hover { background: rgba(122,90,154,0.18); }
        .msgs { flex: 1; overflow-y: auto; padding: 8px 20px 12px; display: flex; flex-direction: column; gap: 14px; scrollbar-width: none; }
        .msgs::-webkit-scrollbar { display: none; }
        .msg-row-bot { display: flex; flex-direction: column; align-items: flex-start; max-width: 92%; }
        .msg-row-user { display: flex; flex-direction: column; align-items: flex-end; }
        .bubble-bot { max-width: 100%; background: rgba(255,255,255,0.65); backdrop-filter: blur(16px); border: 0.5px solid rgba(255,255,255,0.9); border-radius: 4px 20px 20px 20px; padding: 14px 16px; color: #3d2e3d; font-size: 14px; line-height: 1.65; box-shadow: 0 2px 20px rgba(180,140,200,0.07); animation: fadeUp 0.3s ease both; }
        .bubble-bot p { margin-bottom: 6px; }
        .bubble-bot p:last-child { margin-bottom: 0; }
        .bubble-bot a { color: #7a5a9a; text-decoration: underline; }
        .bubble-user { max-width: 72%; background: rgba(100,80,120,0.09); border-radius: 20px 4px 20px 20px; padding: 11px 16px; color: #4a3a5a; font-size: 14px; line-height: 1.55; animation: fadeUp 0.25s ease both; }
        .typing { display: flex; gap: 5px; padding: 13px 16px; background: rgba(255,255,255,0.55); backdrop-filter: blur(12px); border: 0.5px solid rgba(255,255,255,0.9); border-radius: 4px 18px 18px 18px; width: fit-content; }
        .typing span { width: 6px; height: 6px; border-radius: 50%; background: #c0a8d8; animation: bounce 1.2s infinite; }
        .typing span:nth-child(2) { animation-delay: 0.2s; }
        .typing span:nth-child(3) { animation-delay: 0.4s; }
        .bottom { flex-shrink: 0; padding: 8px 20px 32px; background: linear-gradient(to top, rgba(250,247,245,1) 75%, transparent); }
        .action-row { display: flex; gap: 8px; margin-bottom: 10px; }
        .action-btn { display: flex; align-items: center; gap: 5px; padding: 7px 14px; border-radius: 20px; background: rgba(255,255,255,0.6); backdrop-filter: blur(10px); border: 0.5px solid rgba(255,255,255,0.9); font-family: 'Noto Sans TC', sans-serif; font-size: 12px; color: #7a5a9a; cursor: pointer; transition: background 0.15s; }
        .action-btn:hover { background: rgba(255,255,255,0.85); }
        .input-row { display: flex; align-items: flex-end; gap: 10px; background: rgba(255,255,255,0.7); backdrop-filter: blur(20px); border: 0.5px solid rgba(255,255,255,0.95); border-radius: 24px; padding: 10px 10px 10px 18px; box-shadow: 0 4px 24px rgba(180,140,200,0.1); }
        .input-field { flex: 1; border: none; background: transparent; outline: none; font-family: 'Noto Sans TC', sans-serif; font-size: 14px; color: #3d2e3d; resize: none; min-height: 22px; max-height: 120px; line-height: 1.5; }
        .input-field::placeholder { color: #c0b0c8; }
        .send-btn { width: 38px; height: 38px; border-radius: 50%; background: #7a5a9a; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s, transform 0.15s; }
        .send-btn:hover:not(:disabled) { background: #6a4a8a; transform: scale(1.05); }
        .send-btn:active:not(:disabled) { transform: scale(0.95); }
        .send-btn:disabled { background: #d0c0e0; cursor: default; }
        .send-btn svg { width: 15px; height: 15px; }
        .toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(61,46,61,0.9); color: #fff; padding: 10px 20px; border-radius: 20px; font-size: 13px; z-index: 200; backdrop-filter: blur(10px); animation: fadeUp 0.3s ease; white-space: nowrap; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-5px); opacity: 1; } }
      `}</style>

      <div className="blobs">
        <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      </div>

      {toast && <div className="toast">{toast}</div>}

      <div className="shell">
        <div className="hdr">
          <div className="hdr-left">
            <span className="hdr-title">Diet Chat</span>
            <span className="hdr-sub">{locationReady ? "📍 已取得定位" : "尚未取得定位"}</span>
          </div>
          <Link href="/diary" className="diary-btn">📖 吃吃日記</Link>
        </div>

        <div className="msgs">
          {messages.map((msg) =>
            msg.role === "assistant" ? (
              <div key={msg.id} className="msg-row-bot">
                {msg.restaurantCards ? (
                  <div className="bubble-bot" style={{ width: "100%", background: "transparent", border: "none", padding: 0, boxShadow: "none" }}>
                    <RestaurantCards data={msg.restaurantCards} onSaveFood={saveRestaurantFood} />
                  </div>
                ) : (
                  <div className="bubble-bot">
                    <ReactMarkdown
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        a: ({ ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                        p: ({ children }) => <p>{children}</p>,
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ) : (
              <div key={msg.id} className="msg-row-user">
                <div className="bubble-user">{msg.text}</div>
                {msg.detectedFoods && msg.detectedFoods.length > 0 && (
                  <FoodChips foods={msg.detectedFoods} onSave={saveFood} />
                )}
              </div>
            )
          )}
          {loading && (
            <div className="msg-row-bot">
              <div className="typing"><span /><span /><span /></div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="bottom">
          <div className="action-row">
            <button className="action-btn" onClick={getLocation}>📍 取得定位</button>
            <button className="action-btn" onClick={() => fileInputRef.current?.click()}>📷 上傳照片</button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadImage(file); }} />
          </div>
          <div className="input-row">
            <textarea className="input-field"
              placeholder="想說什麼都可以，也可以問我附近有什麼吃的"
              value={input} rows={1}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            />
            <button className="send-btn" onClick={sendMessage} disabled={loading || !input.trim()}>
              <svg viewBox="0 0 24 24" fill="white"><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}