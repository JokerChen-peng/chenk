import crypto from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

/**
 * Tier S #2: Auth.js v5 (next-auth@beta) —— 给 Mastra Memory 一个真实的
 * resourceId 来源，让"小明的浦东 4 小时"不会跟"老婆的家庭日"在同一份 thread 里串味。
 *
 * - Credentials provider，邮箱即用户 ID（demo 不接 email 服务，输入即登录）。
 * - JWT session：cookies 直接带，没有 DB 依赖。生产可换 DatabaseSession + adapter。
 * - AUTH_SECRET：优先走 env；缺了**不抛 MissingSecret**，而是用进程级随机串兜底
 *   并打一行警告，避免 demo 第一次跑就被卡死。生产请务必显式配置。
 */

function resolveAuthSecret(): string {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  const fallback = crypto.randomBytes(32).toString("base64");
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[auth] AUTH_SECRET 未配置，已用进程级随机 secret 兜底；" +
        "重启会导致已登录用户掉线。生产请在 .env.local 里加：\n" +
        "      AUTH_SECRET=$(openssl rand -base64 32)",
    );
  } else {
    console.error(
      "[auth] AUTH_SECRET 在生产环境未配置，已临时使用随机 secret —— 强烈建议立即设置。",
    );
  }
  return fallback;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: resolveAuthSecret(),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "demo-email",
      name: "邮箱直接登录（demo）",
      credentials: {
        email: { label: "邮箱", type: "email" },
        nickname: { label: "昵称", type: "text" },
      },
      async authorize(raw) {
        const email = String(raw?.email ?? "").trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
        const nickname = String(raw?.nickname ?? "").trim();
        return {
          id: email,
          email,
          name: nickname || email.split("@")[0]!,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id?: string }).id ?? token.sub ?? token.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const id =
          (token as { id?: string }).id ??
          token.sub ??
          (session.user.email ?? "anonymous");
        (session.user as { id?: string }).id = String(id);
      }
      return session;
    },
  },
});
