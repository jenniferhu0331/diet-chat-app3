"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, NotFoundException } from "@zxing/browser";

interface NutritionResult {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  source: string;
}

interface BarcodeScannerProps {
  onResult: (result: NutritionResult) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onResult, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [status, setStatus] = useState<"scanning" | "loading" | "error">("scanning");
  const [errorMsg, setErrorMsg] = useState("");
  const [scannedCode, setScannedCode] = useState("");

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    reader.decodeFromVideoDevice(undefined, videoRef.current!, async (result, err) => {
      if (result) {
        const code = result.getText();
        if (code === scannedCode) return; // 避免重複掃描
        setScannedCode(code);
        setStatus("loading");

        try {
          const res = await fetch("/api/barcode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ barcode: code }),
          });
          const data = await res.json();

          if (data.nutrition) {
            onResult(data.nutrition);
          } else {
            setErrorMsg(data.error || "找不到這個商品，試試看手動輸入");
            setStatus("error");
          }
        } catch {
          setErrorMsg("查詢失敗，請再試一次");
          setStatus("error");
        }
      }
      if (err && !(err instanceof NotFoundException)) {
        // 忽略找不到條碼的錯誤（正常掃描中會一直出現）
      }
    });

    return () => {
      reader.reset();
    };
  }, []);

  return (
    <>
      <style>{`
        .scanner-backdrop {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(30,20,40,0.85);
          backdrop-filter: blur(6px);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 20px;
        }
        .scanner-title {
          font-family: 'Noto Sans TC', sans-serif;
          font-size: 16px; color: #fff; font-weight: 500;
        }
        .scanner-frame {
          position: relative;
          width: 280px; height: 280px;
          border-radius: 20px; overflow: hidden;
        }
        .scanner-video {
          width: 100%; height: 100%; object-fit: cover;
        }
        .scanner-overlay {
          position: absolute; inset: 0;
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 20px;
        }
        .scanner-line {
          position: absolute; left: 10%; right: 10%;
          height: 2px; background: rgba(122,90,154,0.8);
          top: 50%;
          animation: scanLine 2s ease-in-out infinite;
        }
        .scanner-corner {
          position: absolute; width: 24px; height: 24px;
          border-color: #9a7ad8; border-style: solid;
        }
        .scanner-corner.tl { top: 12px; left: 12px; border-width: 3px 0 0 3px; border-radius: 4px 0 0 0; }
        .scanner-corner.tr { top: 12px; right: 12px; border-width: 3px 3px 0 0; border-radius: 0 4px 0 0; }
        .scanner-corner.bl { bottom: 12px; left: 12px; border-width: 0 0 3px 3px; border-radius: 0 0 0 4px; }
        .scanner-corner.br { bottom: 12px; right: 12px; border-width: 0 3px 3px 0; border-radius: 0 0 4px 0; }
        .scanner-hint {
          font-family: 'Noto Sans TC', sans-serif;
          font-size: 13px; color: rgba(255,255,255,0.6);
          text-align: center;
        }
        .scanner-loading {
          font-family: 'Noto Sans TC', sans-serif;
          font-size: 14px; color: #c0a8d8;
          display: flex; align-items: center; gap: 8px;
        }
        .scanner-error {
          font-family: 'Noto Sans TC', sans-serif;
          font-size: 13px; color: #f09090;
          text-align: center; max-width: 240px;
        }
        .scanner-btn {
          padding: 10px 28px; border-radius: 20px;
          border: 0.5px solid rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.1);
          color: #fff; font-family: 'Noto Sans TC', sans-serif;
          font-size: 14px; cursor: pointer;
          transition: background 0.15s;
        }
        .scanner-btn:hover { background: rgba(255,255,255,0.2); }
        .scanner-retry {
          padding: 8px 20px; border-radius: 16px;
          border: 0.5px solid rgba(122,90,154,0.5);
          background: rgba(122,90,154,0.2);
          color: #c0a8d8; font-family: 'Noto Sans TC', sans-serif;
          font-size: 13px; cursor: pointer;
        }
        @keyframes scanLine {
          0%, 100% { top: 20%; }
          50% { top: 80%; }
        }
      `}</style>

      <div className="scanner-backdrop">
        <span className="scanner-title">掃描條碼</span>

        <div className="scanner-frame">
          <video ref={videoRef} className="scanner-video" muted playsInline />
          <div className="scanner-overlay" />
          {status === "scanning" && <div className="scanner-line" />}
          <div className="scanner-corner tl" />
          <div className="scanner-corner tr" />
          <div className="scanner-corner bl" />
          <div className="scanner-corner br" />
        </div>

        {status === "scanning" && (
          <p className="scanner-hint">將條碼對準框框內</p>
        )}

        {status === "loading" && (
          <div className="scanner-loading">
            <span>查詢中…</span>
          </div>
        )}

        {status === "error" && (
          <>
            <p className="scanner-error">{errorMsg}</p>
            <button className="scanner-retry" onClick={() => {
              setStatus("scanning");
              setScannedCode("");
              setErrorMsg("");
            }}>
              再試一次
            </button>
          </>
        )}

        <button className="scanner-btn" onClick={onClose}>關閉</button>
      </div>
    </>
  );
}
