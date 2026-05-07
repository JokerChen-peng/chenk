import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function UserPill() {
  let user: { name?: string | null; email?: string | null } | undefined;
  try {
    const session = await auth();
    user = session?.user ?? undefined;
  } catch {
    // 没配 AUTH_SECRET 等启动期错误：直接当未登录处理，不阻塞页面渲染。
    user = undefined;
  }
  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      >
        登录
      </Link>
    );
  }
  const display = user.name || user.email || "已登录";
  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  return (
    <form action={logout} className="flex items-center gap-2">
      <span
        title={user.email ?? undefined}
        className="rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-muted-foreground"
      >
        {display}
      </span>
      <button
        type="submit"
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        退出
      </button>
    </form>
  );
}
