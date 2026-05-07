import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { ChatSessionProvider } from "@/components/chat/chat-session-provider";
import { UserPill } from "@/components/auth/user-pill";
import { NotificationBell } from "@/components/notifications/notification-bell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mastra Assistant Starter",
  description: "Next.js + Mastra + Assistant UI streaming agent starter",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-border/40 bg-background/80 px-4 py-2 backdrop-blur">
          <Link
            href="/"
            className="text-sm font-semibold tracking-tight text-foreground hover:text-foreground/80"
          >
            Mastra Local-Life Agent
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/plans"
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              我的方案
            </Link>
            <Link
              href="/transactions"
              className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              我下过的单
            </Link>
            <NotificationBell />
            <UserPill />
          </div>
        </header>
        <ChatSessionProvider>{children}</ChatSessionProvider>
      </body>
    </html>
  );
}
