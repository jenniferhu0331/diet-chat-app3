"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { addFoodEntry, getTodaySummary } from "@/lib/foodStore";
import { getZooState, getAnimalEmoji, getWeekKey, HatchedAnimal, getAnimalDef } from "@/lib/animalStore";
import { startNotificationScheduler } from "@/lib/notification";
import { saveGratitude, getTodayGratitude } from "@/lib/gratitudeStore";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  detectedFoods?: string[];
  restaurantCards?: RestaurantCardsData;
  foodRecommendation?: FoodRecommendationData;
  drinkRecommendation?: DrinkRecommendationData;
  isGratitude?: boolean;
  showRecordBtn?: boolean; // 顯示「記錄這件事」按鈕
};

type RestaurantRecommendation = { item: string; calories: number; protein: number; fat: number; carbs: number; price: number; };
type RestaurantCard = { name: string; mapsUrl: string; rating: number; isOpen: boolean; walkingMinutes: number; recommendations: RestaurantRecommendation[]; };
type RestaurantCardsData = { intro: string; budget_tip: string; special_tip: string; restaurants: RestaurantCard[]; };
type FoodItem = { name: string; description: string; calories: number; protein: number; fat: number; carbs: number; price: number; };
type FoodRecommendationData = { intro: string; items: FoodItem[]; };
type DrinkItem = { name: string; size: string; sugar: string; ice: string; calories: number; price: number; };
type DrinkShop = { name: string; mapsUrl: string; isOpen: boolean; walkingMinutes: number; items: DrinkItem[]; };
type DrinkRecommendationData = { intro: string; shops: DrinkShop[]; healthy_tip: string; };

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
  try { localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs.slice(-60))); } catch {}
}

function currentMeal(): "早餐" | "午餐" | "晚餐" | "點心" {
  const h = new Date().getHours();
  if (h < 10) return "早餐";
  if (h < 14) return "午餐";
  if (h < 20) return "晚餐";
  return "點心";
}

function detectFoodsInMessage(text: string): string[] {
  const EXCLUDE = new Set(["什麼", "甚麼", "啥", "東西", "好呢", "好ㄋ", "好啊", "呢", "嗎", "嘛", "的", "喔", "喜歡", "可以"]);
  const pattern = /(?:吃了?|點了?|喝了?|來了?|有吃?|吃過?|吃到?)[了一]?\s*([^\s,，。！？、\d]{2,12})/g;
  const found = new Set<string>();
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const raw = m[1].replace(/[了嗎呢啊喔唷哦！？。，、\s]/g, "").trim();
    if (raw.length >= 2 && !EXCLUDE.has(raw)) found.add(raw);
  }
  return [...found];
}

// ── Zoo Background ────────────────────────────────────────────────────────────
function ZooBackground({ animals }: { animals: HatchedAnimal[] }) {
  const completed = animals.filter((a) => a.stage === 4).slice(-6);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      <svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8f5d0" />
            <stop offset="100%" stopColor="#f5fce8" />
          </linearGradient>
          <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c8e8a0" />
            <stop offset="100%" stopColor="#a8d880" />
          </linearGradient>
        </defs>
        <rect width="390" height="844" fill="url(#sky)" />
        <circle cx="50" cy="60" r="28" fill="#ffe080" opacity="0.5" />
        <circle cx="50" cy="60" r="19" fill="#ffd060" opacity="0.6" />
        <g opacity="0.6">
          <ellipse cx="180" cy="50" rx="50" ry="20" fill="white" />
          <ellipse cx="212" cy="40" rx="34" ry="22" fill="white" />
          <ellipse cx="150" cy="46" rx="28" ry="16" fill="white" />
          <ellipse cx="320" cy="75" rx="38" ry="16" fill="white" />
          <ellipse cx="348" cy="65" rx="25" ry="18" fill="white" />
        </g>
        <rect x="0" y="700" width="390" height="144" fill="url(#grass)" opacity="0.6" />
        <path d="M0 710 Q97 697 195 710 Q293 723 390 710 L390 844 L0 844 Z" fill="#b8dc88" opacity="0.5" />
        <g stroke="#c8a060" strokeWidth="2" opacity="0.4" fill="#e8c880">
          {[10,48,86,124,162,200,238,276,314,352].map((x: number) => (
            <g key={x}>
              <rect x={x} y="703" width="9" height="20" rx="2" />
              <polygon points={`${x+4.5},698 ${x},704 ${x+9},704`} />
            </g>
          ))}
          <line x1="0" y1="710" x2="390" y2="710" strokeWidth="2.5" />
          <line x1="0" y1="717" x2="390" y2="717" strokeWidth="2" />
        </g>
        <rect x="14" y="610" width="14" height="100" fill="#8b6f3a" opacity="0.7" />
        <ellipse cx="21" cy="592" rx="32" ry="44" fill="#5a9e30" opacity="0.6" />
        <ellipse cx="21" cy="572" rx="23" ry="33" fill="#6ab840" opacity="0.6" />
        <rect x="360" y="618" width="14" height="92" fill="#8b6f3a" opacity="0.7" />
        <ellipse cx="367" cy="600" rx="32" ry="42" fill="#5a9e30" opacity="0.6" />
        <ellipse cx="367" cy="580" rx="23" ry="32" fill="#6ab840" opacity="0.6" />
        <rect x="82" y="648" width="9" height="58" fill="#8b6f3a" opacity="0.5" />
        <ellipse cx="87" cy="636" rx="20" ry="28" fill="#6ab840" opacity="0.5" />
        <rect x="298" y="644" width="9" height="62" fill="#8b6f3a" opacity="0.5" />
        <ellipse cx="303" cy="631" rx="20" ry="29" fill="#5a9e30" opacity="0.5" />
        <g opacity="0.45">
          <ellipse cx="140" cy="708" rx="25" ry="11" fill="#7ab840" />
          <ellipse cx="255" cy="705" rx="23" ry="10" fill="#6aae30" />
          <ellipse cx="65" cy="710" rx="16" ry="8" fill="#8ac850" />
          <ellipse cx="330" cy="708" rx="18" ry="9" fill="#7ab840" />
        </g>
        <g opacity="0.6">
          {([[115,714],[170,711],[220,713],[275,712],[320,715]] as [number,number][]).map(([x,y],i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="3.5" fill={["#f090a0","#f0b060","#c090e0","#80c0f0","#f0d060"][i]} />
              <line x1={x} y1={y+3} x2={x} y2={y+9} stroke="#70a040" strokeWidth="1.5" />
            </g>
          ))}
        </g>
        {completed.map((animal, i) => {
          const positions: [number,number][] = [[100,692],[165,689],[230,692],[130,699],[195,697],[260,695]];
          const [x,y] = positions[i] ?? [150+i*40, 692];
          return (
            <g key={animal.id}>
              <ellipse cx={x} cy={y+9} rx="14" ry="5" fill="rgba(0,0,0,0.07)" />
              <text x={x} y={y} textAnchor="middle" fontSize="20" style={{userSelect:"none"}}>{getAnimalEmoji(animal)}</text>
            </g>
          );
        })}
        <text x="195" y="672" textAnchor="middle" fontSize="28" opacity="0.7"
          style={{animation:"float 3s ease-in-out infinite", userSelect:"none"}}>🥚</text>
      </svg>
      <style>{"@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}"}</style>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────
function SaveBtn({ saved, saving, onClick }: { saved: boolean; saving: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={saved || saving} style={{
      padding: "3px 10px", borderRadius: 14, fontSize: 11,
      border: "0.5px solid rgba(90,158,48,0.3)",
      background: saved ? "rgba(90,158,48,0.1)" : "rgba(255,255,255,0.8)",
      color: saved ? "#80b060" : "#5a9e30",
      cursor: saved || saving ? "default" : "pointer",
      fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap" as const,
    }}>
      {saved ? "✓ 已記錄" : saving ? "記錄中…" : "+ 記錄"}
    </button>
  );
}

function NutritionRow({ calories, protein, fat, carbs, price }: { calories: number; protein: number; fat: number; carbs: number; price?: number }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#a090b0", flexWrap: "wrap" as const }}>
      <span>🔥 {calories} kcal</span><span>蛋白 {protein}g</span><span>脂 {fat}g</span><span>碳 {carbs}g</span>
      {price ? <span>💰 約 {price} 元</span> : null}
    </div>
  );
}

function FoodChips({ foods, onSave }: { foods: string[]; onSave: (f: string) => Promise<void> }) {
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  async function save(f: string) {
    setSaving((s) => new Set(s).add(f)); await onSave(f);
    setSaving((s) => { const n = new Set(s); n.delete(f); return n; });
    setSaved((s) => new Set(s).add(f));
  }
  if (foods.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 }}>
      {foods.map((f) => (
        <button key={f} onClick={() => save(f)} disabled={saved.has(f)||saving.has(f)} style={{
          padding: "4px 12px", borderRadius: 20, border: "0.5px solid rgba(90,158,48,0.4)",
          background: saved.has(f) ? "rgba(90,158,48,0.1)" : "rgba(255,255,255,0.75)",
          backdropFilter: "blur(10px)", color: saved.has(f) ? "#80b060" : "#5a9e30",
          fontSize: 12, cursor: (saved.has(f)||saving.has(f)) ? "default" : "pointer",
          fontFamily: "inherit", transition: "all 0.15s",
        }}>
          {saved.has(f) ? "✓" : saving.has(f) ? "估算中…" : "+"} {f}
        </button>
      ))}
      {foods.some((f) => !saved.has(f)&&!saving.has(f)) && <span style={{ fontSize: 10, color: "#b0c8a0" }}>點擊記錄到日記</span>}
    </div>
  );
}

function FoodRecommendationCards({ data, onSave }: { data: FoodRecommendationData; onSave: (item: FoodItem) => Promise<void> }) {
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  async function save(item: FoodItem) {
    setSaving((s) => new Set(s).add(item.name)); await onSave(item);
    setSaving((s) => { const n = new Set(s); n.delete(item.name); return n; });
    setSaved((s) => new Set(s).add(item.name));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 14, color: "#3d2e3d", lineHeight: 1.6 }}>{data.intro}</p>
      {data.items.map((item, i) => (
        <div key={i} style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(14px)", border: "0.5px solid rgba(200,230,160,0.6)", borderRadius: 14, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: "#3d2e3d" }}>🍽 {item.name}</span>
            <SaveBtn saved={saved.has(item.name)} saving={saving.has(item.name)} onClick={() => save(item)} />
          </div>
          <p style={{ fontSize: 12, color: "#a090b0" }}>{item.description}</p>
          <NutritionRow calories={item.calories} protein={item.protein} fat={item.fat} carbs={item.carbs} price={item.price} />
        </div>
      ))}
    </div>
  );
}

function DrinkRecommendationCards({ data, onSave }: { data: DrinkRecommendationData; onSave: (shopName: string, item: DrinkItem) => Promise<void> }) {
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  async function save(shopName: string, item: DrinkItem) {
    const key = `${shopName}__${item.name}`;
    setSaving((s) => new Set(s).add(key)); await onSave(shopName, item);
    setSaving((s) => { const n = new Set(s); n.delete(key); return n; });
    setSaved((s) => new Set(s).add(key));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 14, color: "#3d2e3d", lineHeight: 1.6 }}>{data.intro}</p>
      {data.shops.length === 0 ? <p style={{ fontSize: 13, color: "#a090b0" }}>沒有找到附近飲料店。</p> : data.shops.map((shop, i) => (
        <div key={i} style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(14px)", border: "0.5px solid rgba(200,230,160,0.6)", borderRadius: 14, padding: "11px 13px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <a href={shop.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, fontWeight: 500, color: "#3d2e3d", textDecoration: "none", borderBottom: "1px solid rgba(90,158,48,0.3)" }}>{shop.name}</a>
            <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#a090b0" }}>
              <span>{shop.isOpen ? "🟢 營業中" : "⚪ 未確認"}</span><span>🚶 約 {shop.walkingMinutes} 分</span>
            </div>
          </div>
          {shop.items.map((item, j) => {
            const key = `${shop.name}__${item.name}`;
            return (
              <div key={j} style={{ background: "rgba(90,158,48,0.05)", borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#3d2e3d" }}>🧋 {item.name}</span>
                  <SaveBtn saved={saved.has(key)} saving={saving.has(key)} onClick={() => save(shop.name, item)} />
                </div>
                <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#a090b0", flexWrap: "wrap" as const }}>
                  <span>{item.size}</span><span>糖 {item.sugar}</span><span>冰 {item.ice}</span><span>🔥 {item.calories} kcal</span><span>💰 約 {item.price} 元</span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {data.healthy_tip && <p style={{ fontSize: 12, color: "#5a9e30", background: "rgba(90,158,48,0.07)", borderRadius: 10, padding: "7px 11px" }}>💡 {data.healthy_tip}</p>}
    </div>
  );
}

function RestaurantCards({ data, onSaveFood }: { data: RestaurantCardsData; onSaveFood: (name: string, rec: RestaurantRecommendation) => Promise<void> }) {
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  async function saveRec(restaurantName: string, rec: RestaurantRecommendation) {
    const key = `${restaurantName}__${rec.item}`;
    setSaving((s) => new Set(s).add(key)); await onSaveFood(restaurantName, rec);
    setSaving((s) => { const n = new Set(s); n.delete(key); return n; });
    setSaved((s) => new Set(s).add(key));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 14, color: "#3d2e3d", lineHeight: 1.6 }}>{data.intro}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {data.budget_tip && <p style={{ fontSize: 12, color: "#5a9e30", background: "rgba(90,158,48,0.07)", borderRadius: 10, padding: "6px 10px" }}>💰 {data.budget_tip}</p>}
        {data.special_tip && <p style={{ fontSize: 12, color: "#c08060", background: "rgba(240,160,96,0.08)", borderRadius: 10, padding: "6px 10px" }}>✨ {data.special_tip}</p>}
      </div>
      {data.restaurants.map((r, i) => (
        <div key={i} style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(14px)", border: "0.5px solid rgba(200,230,160,0.6)", borderRadius: 16, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <a href={r.mapsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 15, fontWeight: 500, color: "#3d2e3d", textDecoration: "none", borderBottom: "1px solid rgba(90,158,48,0.3)" }}>{r.name}</a>
            <span style={{ fontSize: 11, color: r.isOpen ? "#60b880" : "#b0a0b8" }}>{r.isOpen ? "🟢 營業中" : "⚪ 未確認"}</span>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#a090b0" }}>
            {r.rating && <span>⭐ {r.rating}</span>}<span>🚶 約 {r.walkingMinutes} 分鐘</span>
          </div>
          {r.recommendations.map((rec, j) => {
            const key = `${r.name}__${rec.item}`;
            return (
              <div key={j} style={{ background: "rgba(90,158,48,0.05)", borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#3d2e3d" }}>🥗 {rec.item}</span>
                  <SaveBtn saved={saved.has(key)} saving={saving.has(key)} onClick={() => saveRec(r.name, rec)} />
                </div>
                <NutritionRow calories={rec.calories} protein={rec.protein} fat={rec.fat} carbs={rec.carbs} price={rec.price} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [zooAnimals, setZooAnimals] = useState<HatchedAnimal[]>([]);
  const [gratitudeMode, setGratitudeMode] = useState(false);
  const [gratitudeItems, setGratitudeItems] = useState<string[]>([]);
  const [pendingGratitudeText, setPendingGratitudeText] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSendTimeRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const latRef = useRef<number | null>(null);
  const lngRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);

  useEffect(() => {
    setMessages(loadMessages());
    setHydrated(true);
    const state = getZooState();
    setZooAnimals(state.animals.filter((a) => a.stage === 4));
  }, []);
  useEffect(() => { if (hydrated) saveMessages(messages); }, [messages, hydrated]);
  useEffect(() => { if (hydrated) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), 50); }, [hydrated]);
  useEffect(() => { startNotificationScheduler(); }, []);

  const addMessage = (role: "user" | "assistant", text: string, extras?: Partial<Message>) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role, text, ...extras }]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const getLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latRef.current = pos.coords.latitude; lngRef.current = pos.coords.longitude;
        setLocationReady(true);
        addMessage("assistant", "收到你的位置了，之後如果你想找附近的店，我可以直接幫你查。");
      },
      (err) => { addMessage("assistant", "我這邊沒有拿到定位，不過你還是可以先跟我聊天。"); alert("定位失敗：" + err.message); }
    );
  };

  const saveFood = async (foodName: string) => {
    showToast(`正在估算「${foodName}」的營養…`);
    try {
      const res = await fetch("/api/nutrition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ foodName }) });
      const data = await res.json();
      if (data.calories !== undefined) {
        addFoodEntry({ name: foodName, meal: currentMeal(), source: "chat", calories: data.calories, protein: data.protein, fat: data.fat, carbs: data.carbs });
        showToast(`✓ ${foodName} 已記錄`);
      } else { addFoodEntry({ name: foodName, meal: currentMeal(), source: "chat" }); showToast(`✓ 已記錄「${foodName}」`); }
    } catch { addFoodEntry({ name: foodName, meal: currentMeal(), source: "chat" }); showToast(`✓ 已記錄「${foodName}」`); }
  };

  const saveFoodItem = async (item: FoodItem) => {
    addFoodEntry({ name: item.name, meal: currentMeal(), source: "chat", calories: item.calories, protein: item.protein, fat: item.fat, carbs: item.carbs });
    showToast(`✓ ${item.name} 已記錄`);
  };
  const saveDrinkItem = async (shopName: string, item: DrinkItem) => {
    addFoodEntry({ name: `${item.name}（${shopName}）`, meal: currentMeal(), source: "chat", calories: item.calories });
    showToast(`✓ ${item.name} 已記錄`);
  };
  const saveRestaurantFood = async (restaurantName: string, rec: RestaurantRecommendation) => {
    addFoodEntry({ name: `${rec.item}（${restaurantName}）`, meal: currentMeal(), source: "chat", calories: rec.calories, protein: rec.protein, fat: rec.fat, carbs: rec.carbs });
    showToast(`✓ ${rec.item} 已記錄`);
  };

  // ── 感恩日記模式 ──────────────────────────────────────────────────────────
  const callGratitudeAPI = async (userMessage: string, historyMsgs: Message[]) => {
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, isGratitudeMode: true, history: historyMsgs.filter((m) => m.text && m.text.trim()).map((m) => ({ role: m.role, text: m.text })).slice(-10) }),
      });
      if (!res.body) { setLoading(false); return; }
      const streamId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: streamId, role: "assistant" as const, text: "", isGratitude: true, showRecordBtn: false }]);
      setLoading(false);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const cur = accumulated;
        setMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, text: cur } : m));
      }
      // Show record button after streaming done
      setMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, showRecordBtn: true } : m));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch { setLoading(false); }
  };

  const startGratitudeMode = async () => {
    setGratitudeMode(true);
    setGratitudeItems([]);
    await callGratitudeAPI("", []);
  };

  const recordGratitudeItem = (msgId: string) => {
    // Find the last user message in gratitude mode
    const userMsgs = messages.filter((m) => m.role === "user" && m.isGratitude);
    const lastUserMsg = userMsgs[userMsgs.length - 1];
    if (!lastUserMsg) return;

    const newItems = [...gratitudeItems, lastUserMsg.text];
    setGratitudeItems(newItems);

    // Hide record button on this message
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, showRecordBtn: false } : m));

    if (newItems.length >= 3) {
      // 已記錄三件，自動結束
      const items: [string, string, string] = [newItems[0], newItems[1] ?? "—", newItems[2] ?? "—"];
      saveGratitude(items);
      addMessage("assistant", `今天記了三件感謝的事 🌸 很棒，明天翻出來看應該會很溫暖。`, { isGratitude: false });
      setGratitudeMode(false);
      showToast("感恩日記已儲存 🌸");
    } else {
      // 問下一件
      const count = newItems.length;
      const nextMsg = count === 1 ? `記下來了 ✓ 還有第 ${count + 1} 件想分享的嗎？` : `也記下來了 ✓ 還有想說的嗎？`;
      addMessage("assistant", nextMsg, { isGratitude: true });
    }
  };

  const finishGratitude = () => {
    if (gratitudeItems.length === 0) {
      setGratitudeMode(false);
      return;
    }
    const items: [string, string, string] = [
      gratitudeItems[0] ?? "—",
      gratitudeItems[1] ?? "—",
      gratitudeItems[2] ?? "—",
    ];
    saveGratitude(items);
    addMessage("assistant", `好，幫你記下來了 🌸 今天分享的這些，等以後翻出來看應該會很溫暖。`, { isGratitude: false });
    setGratitudeMode(false);
    showToast("感恩日記已儲存 🌸");
  };

  // ── 一般送訊息 ────────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    if (gratitudeMode) {
      const userText = input.trim();
      setInput("");
      const textarea = document.querySelector('.input-field') as HTMLTextAreaElement;
      if (textarea) { textarea.style.height = "auto"; }
      const userMsgId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: userMsgId, role: "user", text: userText, isGratitude: true }]);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      await callGratitudeAPI(userText, [...messages, { id: userMsgId, role: "user", text: userText, isGratitude: true }]);
      return;
    }

    const now = Date.now();
    if (now - lastSendTimeRef.current < 1200) return;
    lastSendTimeRef.current = now;
    const userText = input.trim();
    const historyToSend = [...messages];
    const foods = detectFoodsInMessage(userText);
    setInput("");
    addMessage("user", userText, { detectedFoods: foods });
    setLoading(true);
    try {
      const todaySummary = getTodaySummary();
      const dietContext = todaySummary.entries.length > 0
        ? `今日攝取 ${Math.round(todaySummary.totalCalories)} kcal，蛋白質 ${Math.round(todaySummary.totalProtein)}g，脂肪 ${Math.round(todaySummary.totalFat)}g，碳水 ${Math.round(todaySummary.totalCarbs)}g，共 ${todaySummary.entries.length} 筆紀錄`
        : "";
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, lat: latRef.current, lng: lngRef.current, history: historyToSend, dietContext }),
      });
      const contentType = res.headers.get("Content-Type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (data.restaurantCards) addMessage("assistant", "", { restaurantCards: data.restaurantCards });
        else if (data.foodRecommendation) addMessage("assistant", "", { foodRecommendation: data.foodRecommendation });
        else if (data.drinkRecommendation) addMessage("assistant", "", { drinkRecommendation: data.drinkRecommendation });
        else if (data.parts && Array.isArray(data.parts)) { for (const part of data.parts) { if (part?.text) addMessage("assistant", part.text); } }
        else if (data.error) addMessage("assistant", `發生錯誤：${data.error}`);
        else addMessage("assistant", "我剛剛沒有順利回覆耶。");
        return;
      }
      if (!res.body) { addMessage("assistant", "我剛剛沒有順利回覆耶。"); return; }
      const streamId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: streamId, role: "assistant" as const, text: "" }]);
      setLoading(false);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const cur = accumulated;
        setMessages((prev) => prev.map((m) => m.id === streamId ? { ...m, text: cur } : m));
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 10);
      }
    } catch { addMessage("assistant", "剛剛出了點問題，你可以再試一次。"); }
    finally { setLoading(false); }
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
    } catch { addMessage("assistant", "圖片上傳失敗了，等等再試一次看看。"); }
    finally { setLoading(false); }
  };

  const renderMessage = (msg: Message) => {
    if (msg.restaurantCards) return <RestaurantCards data={msg.restaurantCards} onSaveFood={saveRestaurantFood} />;
    if (msg.foodRecommendation) return <FoodRecommendationCards data={msg.foodRecommendation} onSave={saveFoodItem} />;
    if (msg.drinkRecommendation) return <DrinkRecommendationCards data={msg.drinkRecommendation} onSave={saveDrinkItem} />;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, maxWidth: "88%" }}>
        <div className={msg.isGratitude ? "bubble-gratitude" : "bubble-bot"}>
          <ReactMarkdown rehypePlugins={[rehypeRaw]} components={{
            a: ({ ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
            p: ({ children }) => <p>{children}</p>,
          }}>{msg.text}</ReactMarkdown>
        </div>
        {msg.isGratitude && msg.showRecordBtn && msg.text && (
          <button onClick={() => recordGratitudeItem(msg.id)} style={{
            padding: "6px 16px", borderRadius: 16, fontSize: 12,
            background: "rgba(255,183,77,0.15)", border: "0.5px solid rgba(255,183,77,0.5)",
            color: "#a06010", cursor: "pointer", fontFamily: "inherit",
          }}>記錄這件事 ✓</button>
        )}
      </div>
    );
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500&family=DM+Serif+Display:ital@0;1&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }
        body { font-family: 'Noto Sans TC', sans-serif; background: #e8f5d0; }
        .page-root { position: relative; width: 100%; height: 100dvh; display: flex; flex-direction: column; align-items: center; }
        .top-nav { position: relative; z-index: 10; width: 100%; max-width: 480px; padding: 52px 20px 12px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .app-title { font-family: 'DM Serif Display', serif; font-size: 22px; color: #2d4a1e; }
        .app-sub { font-size: 11px; color: #88a870; margin-top: 2px; }
        .nav-btns { display: flex; gap: 6px; }
        .nav-btn { display: flex; align-items: center; gap: 4px; padding: 6px 11px; border-radius: 20px; background: rgba(255,255,255,0.75); border: 0.5px solid rgba(160,210,100,0.5); font-size: 11px; font-weight: 500; text-decoration: none; transition: background 0.15s; backdrop-filter: blur(8px); }
        .nav-btn-green { color: #5a9e30; } .nav-btn-green:hover { background: rgba(200,240,160,0.6); }
        .nav-btn-purple { color: #7a5a9a; } .nav-btn-purple:hover { background: rgba(200,180,240,0.4); }
        .nav-btn-orange { color: #c08060; } .nav-btn-orange:hover { background: rgba(240,160,96,0.25); }
        .chat-float {
          position: relative; z-index: 10;
          width: calc(100% - 32px); max-width: 448px;
          flex: 1; display: flex; flex-direction: column;
          margin-bottom: 22vh; margin-left: 16px; margin-right: 16px;
          min-height: 0;
          background: rgba(255,255,255,0.72);
          backdrop-filter: blur(18px);
          border-radius: 24px;
          border: 0.5px solid rgba(200,230,160,0.5);
          box-shadow: 0 8px 40px rgba(90,158,48,0.12);
          overflow: hidden;
        }
        .msgs { flex: 1; overflow-y: auto; padding: 12px 16px 8px; display: flex; flex-direction: column; gap: 12px; scrollbar-width: none; min-height: 0; }
        .msgs::-webkit-scrollbar { display: none; }
        .msg-row-bot { display: flex; flex-direction: column; align-items: flex-start; width: 100%; }
        .msg-row-user { display: flex; flex-direction: column; align-items: flex-end; }
        .bubble-bot { max-width: 100%; background: rgba(255,255,255,0.9); border: 0.5px solid rgba(200,230,160,0.8); border-radius: 4px 18px 18px 18px; padding: 10px 14px; color: #2d4a1e; font-size: 14px; line-height: 1.65; animation: fadeUp 0.3s ease both; }
        .bubble-bot p { margin-bottom: 6px; } .bubble-bot p:last-child { margin-bottom: 0; }
        .bubble-bot a { color: #5a9e30; text-decoration: underline; }
        .bubble-gratitude { max-width: 100%; background: rgba(255,248,225,0.95); border: 0.5px solid rgba(255,183,77,0.4); border-radius: 4px 18px 18px 18px; padding: 10px 14px; color: #5a3a10; font-size: 14px; line-height: 1.65; animation: fadeUp 0.3s ease both; }
        .bubble-gratitude p { margin-bottom: 6px; } .bubble-gratitude p:last-child { margin-bottom: 0; }
        .bubble-user { max-width: 75%; background: rgba(90,158,48,0.13); border-radius: 18px 4px 18px 18px; padding: 10px 14px; color: #2d4a1e; font-size: 14px; line-height: 1.55; animation: fadeUp 0.25s ease both; }
        .typing { display: flex; gap: 5px; padding: 10px 14px; background: rgba(255,255,255,0.9); border: 0.5px solid rgba(200,230,160,0.6); border-radius: 4px 18px 18px 18px; width: fit-content; }
        .typing span { width: 6px; height: 6px; border-radius: 50%; background: #90c860; animation: bounce 1.2s infinite; }
        .typing span:nth-child(2) { animation-delay: 0.2s; } .typing span:nth-child(3) { animation-delay: 0.4s; }
        .bottom { flex-shrink: 0; padding: 6px 12px 10px; }
        .gratitude-bar { background: rgba(255,248,225,0.9); border-top: 0.5px solid rgba(255,183,77,0.3); padding: 5px 12px; font-size: 11px; color: #a06010; display: flex; align-items: center; justify-content: space-between; }
        .action-row { display: flex; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
        .action-btn { display: flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 16px; background: rgba(255,255,255,0.8); border: 0.5px solid rgba(160,210,100,0.4); font-family: 'Noto Sans TC', sans-serif; font-size: 11px; color: #5a9e30; cursor: pointer; transition: background 0.15s; }
        .action-btn:hover { background: rgba(220,245,190,0.7); }
        .input-row { display: flex; align-items: flex-end; gap: 8px; background: rgba(255,255,255,0.9); border: 0.5px solid rgba(160,210,100,0.5); border-radius: 20px; padding: 8px 8px 8px 14px; }
        .input-field { flex: 1; border: none; background: transparent; outline: none; font-family: 'Noto Sans TC', sans-serif; font-size: 14px; color: #2d4a1e; resize: none; min-height: 20px; max-height: 80px; line-height: 1.5; }
        .input-field::placeholder { color: #a8c890; }
        .send-btn { width: 34px; height: 34px; border-radius: 50%; background: #5a9e30; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s; }
        .send-btn:hover:not(:disabled) { background: #4a8e20; }
        .send-btn:disabled { background: #b8d8a0; cursor: default; }
        .send-btn svg { width: 13px; height: 13px; }
        .toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: rgba(45,74,30,0.9); color: #fff; padding: 10px 20px; border-radius: 20px; font-size: 13px; z-index: 300; backdrop-filter: blur(10px); animation: fadeUp 0.3s ease; white-space: nowrap; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounce { 0%,80%,100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-4px); opacity: 1; } }
      `}</style>

      <ZooBackground animals={zooAnimals} />
      {toast && <div className="toast">{toast}</div>}

      <div className="page-root">
        <div className="top-nav">
          <div>
            <div className="app-title">小食 🌿</div>
            <div className="app-sub">{locationReady ? "📍 已取得定位" : "尚未取得定位"}</div>
          </div>
          <div className="nav-btns">
            <Link href="/zoo" className="nav-btn nav-btn-green">🥚 動物園</Link>
            <Link href="/gratitude" className="nav-btn nav-btn-orange">🌸 感恩</Link>
            <Link href="/diary" className="nav-btn nav-btn-purple">📖 日記</Link>
          </div>
        </div>

        <div className="chat-float">
          <div className="msgs">
            {messages.map((msg) =>
              msg.role === "assistant" ? (
                <div key={msg.id} className="msg-row-bot">{renderMessage(msg)}</div>
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
            {gratitudeMode && (
              <div className="gratitude-bar">
                <span>🌸 感恩日記 — 已記錄 {gratitudeItems.length} 件</span>
                <button onClick={finishGratitude} style={{ background: "none", border: "none", fontSize: 11, color: "#a06010", cursor: "pointer" }}>
                  {gratitudeItems.length > 0 ? "完成並儲存" : "結束"}
                </button>
              </div>
            )}
            <div className="action-row">
              <button className="action-btn" onClick={getLocation}>📍 定位</button>
              <button className="action-btn" onClick={() => fileInputRef.current?.click()}>📷 照片</button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadImage(file); }} />
              {!gratitudeMode && (
                <button className="action-btn" onClick={startGratitudeMode} style={{ color: "#a06010", borderColor: "rgba(255,183,77,0.5)" }}>🌸 感恩日記</button>
              )}
            </div>
            <div className="input-row">
              <textarea className="input-field"
                placeholder={gratitudeMode ? "分享今天讓你感謝的事…" : "想說什麼都可以，也可以問我附近有什麼吃的"}
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
      </div>
    </>
  );
}