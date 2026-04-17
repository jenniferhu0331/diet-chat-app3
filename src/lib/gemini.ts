import { GoogleGenAI } from "@google/genai";

export const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

export const GEMINI_MODEL = "gemini-2.5-flash";
// 可選 fallback
export const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite";