import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";
import "./showcase.css";
import "@/components/workspace.css";
import "@/components/dashboard.css";
import "@/components/pipeline-scroll.css";
import "@/components/customer-editor.css";

export const metadata: Metadata = {
  title: "远航 · 海外客户开发工作台",
  description: "从潜在客户研究、人工审核到销售跟进的完整工作流演示",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
