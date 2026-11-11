import type { Metadata } from "next";
import "./globals.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "OpenGEO · 本地 GEO 工作台",
  description: "用可回放的回答证据，理解品牌在 AI 中的表现。",
  icons: { icon: "/opengeo.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
