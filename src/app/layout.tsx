import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Potluck 🥚",
  description: "記錄每一餐，孵化你的夥伴",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
