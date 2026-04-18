"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { supabaseBrowser } from "@/lib/supabase";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const getGreetingByTime = () => {
  const hour = new Date().getHours();

  if (hour < 3) {
    return "哇！你還沒睡喔 在看劇嗎 還是功課很多";
  }
  if (hour < 8) {
    return "唉呦 今天很早起喔 吃早餐了嗎？要幫你找嗎";
  }
  if (hour < 10) {
    return "早安～想吃什麼？我也可以幫你找附近還有開的店";
  }
  if (hour < 17) {
    return "嗨，午安～今天想吃點什麼？我可以幫你找附近的選擇。";
  }
  return "嗨，晚安～今天想吃什麼？我也可以幫你找附近還有開的店。";
};

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-message",
      role: "assistant",
      text: getGreetingByTime(),
    },
  ]);
  const [input, setInput] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastSendTimeRef = useRef(0);

  // 新增：使用者初始化相關 state
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

  const addMessage = (role: "user" | "assistant", text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role,
        text,
      },
    ]);
  };

  // 新增：初始化匿名登入
  console.log("SUPABASE URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log("SUPABASE ANON KEY exists:", !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  useEffect(() => {
    const initAnonymousUser = async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();

      if (session?.user?.id) {
        setAuthUserId(session.user.id);

        const savedDisplayId = localStorage.getItem("display_id");
        if (savedDisplayId) {
          setDisplayId(savedDisplayId);
          setNeedsProfileSetup(false);
        } else {
          setNeedsProfileSetup(true);
        }

        setIsReady(true);
        return;
      }

      const { data, error } = await supabaseBrowser.auth.signInAnonymously();

      if (error) {
        console.error("Anonymous sign-in failed:", error);
        return;
      }

      if (data.user?.id) {
        setAuthUserId(data.user.id);

        const savedDisplayId = localStorage.getItem("display_id");
        if (savedDisplayId) {
          setDisplayId(savedDisplayId);
          setNeedsProfileSetup(false);
        } else {
          setNeedsProfileSetup(true);
        }

        setIsReady(true);
      }
    };

    initAnonymousUser();
  }, []);

  // 新增：讀取聊天記憶
  useEffect(() => {
    const loadHistory = async () => {
      if (!authUserId) return;
      if (needsProfileSetup) return;

      const res = await fetch(`/api/chat/history?userId=${authUserId}`);
      const data = await res.json();

      if (data.messages?.length) {
        setMessages(
          data.messages.map((m: any) => ({
            id: String(m.id),
            role: m.role,
            text: m.text,
          }))
        );
      } else {
        // 如果還沒有歷史訊息，保留你的時間 greeting
        setMessages([
          {
            id: "welcome-message",
            role: "assistant",
            text: getGreetingByTime(),
          },
        ]);
      }
    };

    loadHistory();
  }, [authUserId, needsProfileSetup]);

  const setupProfile = async () => {
    if (!authUserId || !displayId.trim()) return;

    const res = await fetch("/api/auth/init-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        authUserId,
        displayId: displayId.trim(),
      }),
    });

    const data = await res.json();

    if (data.error) {
      alert(data.error);
      return;
    }

    localStorage.setItem("display_id", displayId.trim());
    setNeedsProfileSetup(false);
  };

  const saveChatMessage = async (
    userId: string,
    role: "user" | "assistant",
    text: string
  ) => {
    await fetch("/api/chat/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        role,
        text,
      }),
    });
  };

  const getLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setLocationReady(true);
        addMessage(
          "assistant",
          "收到你的位置了，之後如果你想找附近的店，我可以直接幫你查。"
        );
      },
      (err) => {
        addMessage("assistant", "我這邊沒有拿到定位，不過你還是可以先跟我聊天。");
        alert("定位失敗：" + err.message);
      }
    );
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const now = Date.now();
    if (now - lastSendTimeRef.current < 1200) return;
    lastSendTimeRef.current = now;

    const userText = input.trim();
    const historyToSend = [...messages];

    setInput("");
    addMessage("user", userText);
    setLoading(true);

    try {
      // 先存 user 訊息
      if (authUserId) {
        await saveChatMessage(authUserId, "user", userText);
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userText,
          lat,
          lng,
          history: historyToSend,
        }),
      });

      const data = await res.json();

      if (data.parts && Array.isArray(data.parts)) {
        for (const part of data.parts) {
          if (part?.text) {
            addMessage("assistant", part.text);

            // 存 assistant 訊息
            if (authUserId) {
              await saveChatMessage(authUserId, "assistant", part.text);
            }
          }
        }
      } else if (data.reply) {
        addMessage("assistant", data.reply);

        if (authUserId) {
          await saveChatMessage(authUserId, "assistant", data.reply);
        }
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
  formData.append("userId", authUserId!);
  formData.append("mealType", "snack"); // 先預設，可之後再改成讓使用者選

  addMessage("user", `［上傳了一張圖片：${file.name}］`);
  setLoading(true);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (data.analysis) {
      addMessage("assistant", data.analysis);

      if (authUserId) {
        await saveChatMessage(authUserId, "user", `［上傳了一張圖片：${file.name}］`);
        await saveChatMessage(authUserId, "assistant", data.analysis);
      }
    } else if (data.error) {
      addMessage("assistant", `圖片處理失敗：${data.error}`);
    } else {
      addMessage("assistant", "我有收到圖片，但暫時沒辦法分析。");
    }
  } catch {
    addMessage("assistant", "圖片上傳失敗了，等等再試一次看看。");
  } finally {
    setLoading(false);
  }
};

  if (!isReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-100">
        <div className="rounded-2xl bg-white px-6 py-4 shadow-sm text-gray-700">
          正在初始化使用者…
        </div>
      </main>
    );
  }

  if (needsProfileSetup) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-stone-100 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-sm space-y-4">
          <h1 className="text-xl font-semibold">先設定你的使用者 ID</h1>
          <p className="text-sm text-gray-600">
            之後聊天記憶、照片與回顧都會綁定這個 ID。
          </p>
          <input
            className="w-full rounded-xl border p-3"
            placeholder="例如 amy01"
            value={displayId}
            onChange={(e) => setDisplayId(e.target.value)}
          />
          <button
            onClick={setupProfile}
            className="w-full rounded-xl bg-black px-4 py-2 text-white"
          >
            開始使用
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
        <header className="sticky top-0 z-10 border-b bg-white px-4 py-3">
          <h1 className="text-lg font-semibold">Diet Chat</h1>
          <p className="text-sm text-gray-500">
            {locationReady ? "已取得定位" : "尚未取得定位"}
            {displayId ? ` ・ 使用者：${displayId}` : ""}
          </p>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 shadow-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-900"
                }`}
              >
                <div className="whitespace-pre-wrap break-words">
                  <ReactMarkdown
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      a: ({ ...props }) => (
                        <a
                          {...props}
                          className={`underline ${
                            msg.role === "user" ? "text-white" : "text-blue-600"
                          }`}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      ),
                      p: ({ children }) => (
                        <p className="mb-2 last:mb-0">{children}</p>
                      ),
                    }}
                  >
                    {msg.text}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-white px-4 py-3 text-gray-500 shadow-sm">
                正在回覆…
              </div>
            </div>
          )}
        </div>

        <div className="border-t bg-white p-4 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={getLocation}
              className="rounded-xl border px-3 py-2 text-sm"
            >
              取得定位
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border px-3 py-2 text-sm"
            >
              上傳照片
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadImage(file);
              }}
            />
          </div>

          <div className="flex gap-2">
            <textarea
              className="min-h-[52px] flex-1 rounded-2xl border p-3"
              placeholder="想說什麼都可以，也可以問我附近有什麼吃的"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              className="rounded-2xl bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              送出
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}