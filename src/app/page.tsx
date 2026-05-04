"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import {
  startMealReminderScheduler,
  requestReminderPermission,
  setNotificationCallback,
  getRandomBuddyMessage,
} from "@/lib/mealReminder";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  memeUrl?: string;
  isInAppNotif?: boolean;
};

const MSGS_KEY = "buddybite-messages-v2";

const GREETING_POOL = [
  "幹你終於來了，今天吃了什麼？",
  "ㄟ你來了，快跟我說你今天吃了什麼好料",
  "喔你在喔，最近飲控怎樣？說實話",
  "欸你這個月體重怎樣了，不要說你沒有量",
  "你來了！我剛在想你有沒有在認真",
];

function getGreeting() {
  return GREETING_POOL[Math.floor(Math.random() * GREETING_POOL.length)];
}

function loadMsgs(): Message[] {
  try { const r = localStorage.getItem(MSGS_KEY); if (r) return JSON.parse(r); } catch {}
  return [{ id: "w0", role: "assistant", text: getGreeting() }];
}
function saveMsgs(msgs: Message[]) {
  try { localStorage.setItem(MSGS_KEY, JSON.stringify(msgs.slice(-80))); } catch {}
}

// ── MemeCard ──────────────────────────────────────────────────────────────────
type MemeTexts = Record<string, string>;

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  align: CanvasTextAlign = "center",
  color = "#ffffff",
  outlineColor = "#000000",
) {
  ctx.font = `bold ${fontSize}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  ctx.textAlign = align;
  ctx.lineWidth = fontSize * 0.14;
  ctx.strokeStyle = outlineColor;
  ctx.fillStyle = color;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function renderMemeCanvas(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  format: string,
  texts: MemeTexts,
) {
  const W = img.width;
  const H = img.height;
  ctx.drawImage(img, 0, 0);

  const fs = Math.max(26, Math.floor(W / 11));
  const pad = fs * 0.7;

  if (format === "two_row") {
    // 上方文字（第一個 key）、下方文字（第二個 key）
    const keys = Object.keys(texts).filter(k => k !== "caption");
    if (keys[0] && texts[keys[0]]) drawText(ctx, texts[keys[0]], W / 2, pad + fs, fs);
    if (keys[1] && texts[keys[1]]) drawText(ctx, texts[keys[1]], W / 2, H - pad, fs);

  } else if (format === "two_buttons") {
    const fsBig = Math.max(20, Math.floor(W / 15));
    // 左邊按鈕：x 約 26%，y 約 30%（按鈕中央偏上）
    if (texts.btn1) {
      drawText(ctx, texts.btn1, W * 0.26, H * 0.30, fsBig, "center", "#000000", "#ffffff");
    }
    // 右邊按鈕：x 約 74%，y 約 30%
    if (texts.btn2) {
      drawText(ctx, texts.btn2, W * 0.74, H * 0.30, fsBig, "center", "#000000", "#ffffff");
    }
  }
}

function MemeCard({ memeUrl, caption }: {
  memeUrl: string;
  caption?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div style={{
      maxWidth: "85%",
      background: "rgba(255,255,255,0.9)",
      border: "0.5px solid rgba(200,230,160,0.8)",
      borderRadius: "4px 18px 18px 18px",
      overflow: "hidden",
      animation: "fadeUp 0.3s ease both",
    }}>
      {caption && (
        <div style={{ padding: "10px 14px 6px", fontSize: 14, color: "#2d4a1e", lineHeight: 1.5 }}>
          {caption}
        </div>
      )}
      {error ? (
        <div style={{ padding: "10px 14px", fontSize: 12, color: "#a0b890" }}>梗圖生成失敗 😅</div>
      ) : (
        <img
          src={memeUrl}
          alt="梗圖"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{ width: "100%", display: loaded ? "block" : "none" }}
        />
      )}
      {!loaded && !error && (
        <div style={{ padding: "10px 14px", fontSize: 12, color: "#a0b890" }}>生成中...</div>
      )}
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
        <circle cx="50" cy="60" r="28" fill="#ffe080" opacity="0.4" />
        <g opacity="0.4">
          <ellipse cx="200" cy="48" rx="52" ry="20" fill="white" />
          <ellipse cx="232" cy="38" rx="36" ry="22" fill="white" />
          <ellipse cx="330" cy="72" rx="40" ry="16" fill="white" />
        </g>
      </svg>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [hydrated, setHydrated]   = useState(false);
  const [memeLoading, setMemeLoading] = useState(false);
  const [nickname, setNickname]   = useState("");
  const [showLogin, setShowLogin] = useState(false);

  const msgsEndRef  = useRef<HTMLDivElement>(null);
  const lastSendRef = useRef(0);
  const fileRef     = useRef<HTMLInputElement | null>(null);
  const nicknameRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const pushMsg = useCallback((msg: Omit<Message, "id">) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), ...msg }]);
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    setMessages(loadMsgs());
    setHydrated(true);

    const stored = localStorage.getItem("buddybite-user");
    if (stored) setNickname(stored);
    else setShowLogin(true);

    // 設定 in-app notification callback
    setNotificationCallback((text, type, memeData) => {
  if (type === "meme" && memeData) {
    pushMsg({ role: "assistant", text, memeUrl: (memeData as any).memeUrl, isInAppNotif: true });
  } else {
    pushMsg({ role: "assistant", text, isInAppNotif: true });
  }
});

    // 啟動排程
    requestReminderPermission().then(granted => {
      startMealReminderScheduler();
    });
  }, [pushMsg]);

  useEffect(() => { if (hydrated) saveMsgs(messages); }, [messages, hydrated]);
  useEffect(() => {
    if (hydrated) setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: "auto" }), 80);
  }, [hydrated]);

  // ── 手動要求梗圖 ──────────────────────────────────────────────────────────
  const requestMeme = async (trigger = "random") => {
  setMemeLoading(true);
  try {
    const res = await fetch("/api/meme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger }),
    });
    const data = await res.json();
    if (data.memeUrl) {
      pushMsg({ role: "assistant", text: data.caption ?? "", memeUrl: data.memeUrl });
    }
  } catch {
    pushMsg({ role: "assistant", text: "傳梗圖失敗了啦，改天再說" });
  } finally {
    setMemeLoading(false);
  }
};

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = async () => {
    if (!input.trim() || loading) return;
    const now = Date.now();
    if (now - lastSendRef.current < 800) return;
    lastSendRef.current = now;

    const userText = input.trim();
    setInput("");
    pushMsg({ role: "user", text: userText });
    setLoading(true);

    try {
      const historyToSend = messages.slice(-12).map(m => ({ role: m.role, text: m.text }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, history: historyToSend }),
      });

      if (!res.body) return;

      const streamId = crypto.randomUUID();
      setMessages(prev => [...prev, { id: streamId, role: "assistant", text: "" }]);
      setLoading(false);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const cur = acc;
        setMessages(prev => prev.map(m => m.id === streamId ? { ...m, text: cur } : m));
        scrollToBottom();
      }

      // 10% 機率在回覆後附上一張梗圖（不要每次都有）
      if (Math.random() < 0.1) {
        setTimeout(() => requestMeme("random"), 1500);
      }

    } catch {
      pushMsg({ role: "assistant", text: "幹剛剛當機了，你說什麼？" });
    } finally {
      setLoading(false);
    }
  };

  // ── 拍照上傳 ──────────────────────────────────────────────────────────────
  const uploadImage = async (file: File) => {
    pushMsg({ role: "user", text: `（傳了一張照片：${file.name}）` });
    setLoading(true);
    try {
      const f = new FormData(); f.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: f });
      const data = await res.json();
      pushMsg({ role: "assistant", text: data.analysis ?? "我看到了，你說說是什麼？" });
    } catch { pushMsg({ role: "assistant", text: "照片傳不到欸，你重試一下" }); }
    finally { setLoading(false); }
  };

  const quickActions = [
    { label: "吃了垃圾食物 🍕", text: "我剛吃了不健康的東西" },
    { label: "吃了健康食物 🥗", text: "我剛吃了還不錯的東西" },
    { label: "沒動 🛋️",         text: "我今天完全沒運動" },
    { label: "有運動 🏃",        text: "我今天有出去動一下" },
    { label: "傳梗圖來",          text: "" }, // 特殊
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
        .chat-wrap { position: relative; z-index: 10; width: calc(100% - 32px); max-width: 448px; flex: 1; display: flex; flex-direction: column; margin-bottom: 10px; min-height: 0; background: rgba(255,255,255,0.72); backdrop-filter: blur(18px); border-radius: 24px; border: 0.5px solid rgba(200,230,160,0.5); box-shadow: 0 8px 40px rgba(90,158,48,0.12); overflow: hidden; }
        .msgs { flex: 1; overflow-y: auto; padding: 12px 16px 6px; display: flex; flex-direction: column; gap: 10px; scrollbar-width: none; min-height: 0; }
        .msgs::-webkit-scrollbar { display: none; }
        .row-bot { display: flex; flex-direction: column; align-items: flex-start; width: 100%; gap: 6px; }
        .row-user { display: flex; flex-direction: column; align-items: flex-end; }
        .bubble-bot { max-width: 88%; background: rgba(255,255,255,0.9); border: 0.5px solid rgba(200,230,160,0.8); border-radius: 4px 18px 18px 18px; padding: 10px 14px; color: #2d4a1e; font-size: 14px; line-height: 1.65; animation: fadeUp 0.3s ease both; }
        .bubble-bot p { margin-bottom: 4px; } .bubble-bot p:last-child { margin-bottom: 0; }
        .bubble-user { max-width: 78%; background: rgba(90,158,48,0.13); border-radius: 18px 4px 18px 18px; padding: 10px 14px; color: #2d4a1e; font-size: 14px; line-height: 1.55; animation: fadeUp 0.25s ease both; }
        .typing { display: flex; gap: 5px; padding: 10px 14px; background: rgba(255,255,255,0.9); border: 0.5px solid rgba(200,230,160,0.6); border-radius: 4px 18px 18px 18px; width: fit-content; }
        .typing span { width: 6px; height: 6px; border-radius: 50%; background: #90c860; animation: bounce 1.2s infinite; }
        .typing span:nth-child(2) { animation-delay: 0.2s; } .typing span:nth-child(3) { animation-delay: 0.4s; }
        .bottom { flex-shrink: 0; padding: 6px 12px 10px; }
        .quick-row { display: flex; gap: 5px; margin-bottom: 7px; overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
        .quick-row::-webkit-scrollbar { display: none; }
        .quick-btn { flex-shrink: 0; padding: 5px 11px; border-radius: 16px; background: rgba(255,255,255,0.85); border: 0.5px solid rgba(160,210,100,0.4); font-family: 'Noto Sans TC', sans-serif; font-size: 11px; color: #5a9e30; cursor: pointer; white-space: nowrap; transition: background 0.15s; }
        .quick-btn:hover { background: rgba(220,245,190,0.8); }
        .quick-btn.meme-btn { color: #c08060; border-color: rgba(200,140,80,0.4); }
        .input-row { display: flex; align-items: flex-end; gap: 8px; background: rgba(255,255,255,0.9); border: 0.5px solid rgba(160,210,100,0.5); border-radius: 20px; padding: 8px 8px 8px 14px; }
        .inp { flex: 1; border: none; background: transparent; outline: none; font-family: 'Noto Sans TC', sans-serif; font-size: 14px; color: #2d4a1e; resize: none; min-height: 20px; max-height: 80px; line-height: 1.5; }
        .inp::placeholder { color: #a8c890; }
        .send-btn { width: 34px; height: 34px; border-radius: 50%; background: #5a9e30; border: none; cursor: pointer; display: flex; align-items: center; justify-Content: center; flex-shrink: 0; }
        .send-btn:hover:not(:disabled) { background: #4a8e20; }
        .send-btn:disabled { background: #b8d8a0; cursor: default; }
        .clear-btn { background: rgba(255,71,87,0.12); color: #ff4757; border: 0.5px solid rgba(255,71,87,0.3); padding: 5px 10px; border-radius: 12px; font-size: 11px; cursor: pointer; font-family: inherit; }
        .notif-badge { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #ff6b6b; margin-left: 4px; vertical-align: middle; animation: pulse 1.5s ease-in-out infinite; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0);opacity:.5} 40%{transform:translateY(-4px);opacity:1} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      <Background />

      {/* 登入視窗 */}
      {showLogin && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "white", padding: "28px 24px", borderRadius: 24,
            width: "88%", maxWidth: 320, textAlign: "center",
            boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🫂</div>
            <h2 style={{ color: "#2d4a1e", fontSize: 18, marginBottom: 8 }}>
              你好，我是小餅
            </h2>
            <p style={{ color: "#5a6a40", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
              你的損友兼飲食監督者<br/>先告訴我你叫什麼
            </p>
            <input
              ref={nicknameRef}
              maxLength={10}
              placeholder="你的名字或暱稱"
              style={{
                width: "100%", padding: "11px 14px", borderRadius: 12,
                border: "1.5px solid #c0d8a0", marginBottom: 16,
                fontSize: 15, textAlign: "center", outline: "none",
                fontFamily: "inherit",
              }}
              onKeyDown={e => {
                if (e.key === "Enter" && nicknameRef.current?.value.trim()) {
                  const v = nicknameRef.current.value.trim();
                  localStorage.setItem("buddybite-user", v);
                  setNickname(v);
                  setShowLogin(false);
                }
              }}
            />
            <button
              style={{
                width: "100%", padding: "12px", borderRadius: 12,
                background: "#5a9e30", color: "white", border: "none",
                fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              }}
              onClick={() => {
                const v = nicknameRef.current?.value.trim();
                if (v) {
                  localStorage.setItem("buddybite-user", v);
                  setNickname(v);
                  setShowLogin(false);
                }
              }}
            >
              好，開始
            </button>
          </div>
        </div>
      )}

      <div className="root">
        <div className="topbar" style={{ maxWidth: 480 }}>
          <div>
            <div className="title">小餅 🫂</div>
            <div className="sub">
              {nickname ? `${nickname} 的損友` : "你的損友"}
            </div>
          </div>
          <button className="clear-btn" onClick={() => {
            localStorage.removeItem(MSGS_KEY);
            localStorage.removeItem("buddybite-user");
            localStorage.removeItem("buddybite-last-reminder");
            localStorage.removeItem("buddybite-last-meme");
            window.location.reload();
          }}>
            清除
          </button>
        </div>

        <div className="chat-wrap">
          <div className="msgs">
            {messages.map(msg =>
              msg.role === "user" ? (
                <div key={msg.id} className="row-user">
                  <div className="bubble-user">{msg.text}</div>
                </div>
              ) : (
                <div key={msg.id} className="row-bot">
                  {msg.isInAppNotif && (
                    <div style={{ fontSize: 10, color: "#a0b890", marginBottom: 3, marginLeft: 4 }}>
                      小餅傳來
                    </div>
                  )}
                 {msg.memeUrl ? (
                  <MemeCard memeUrl={msg.memeUrl} caption={msg.text} />
                  ) : (
                    <div className="bubble-bot">
                      <ReactMarkdown rehypePlugins={[rehypeRaw]}>{msg.text}</ReactMarkdown>
                    </div>
                  )}
                </div>
              )
            )}
            {(loading || memeLoading) && (
              <div className="row-bot">
                <div className="typing"><span /><span /><span /></div>
              </div>
            )}
            <div ref={msgsEndRef} />
          </div>

          <div className="bottom">
            <div className="quick-row">
              {quickActions.map(a =>
                a.label === "傳梗圖來" ? (
                  <button
                    key="meme"
                    className="quick-btn meme-btn"
                    disabled={memeLoading}
                    onClick={() => requestMeme("random")}
                  >
                    {memeLoading ? "生成中..." : "傳梗圖來 🖼️"}
                  </button>
                ) : (
                  <button key={a.label} className="quick-btn" onClick={() => {
                    setInput(a.text);
                    setTimeout(() => (document.querySelector(".inp") as HTMLTextAreaElement)?.focus(), 50);
                  }}>
                    {a.label}
                  </button>
                )
              )}
              <button className="quick-btn" style={{ color: "#8090a0" }}
                onClick={() => fileRef.current?.click()}>
                📷 拍照
              </button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f); }} />
            </div>
            <div className="input-row">
              <textarea className="inp"
                placeholder="跟小餅說說你吃了什麼..."
                value={input} rows={1}
                onChange={e => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
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
