import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage(props: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const sp = await props.searchParams;
  const session = await auth();
  if (session?.user) {
    redirect(sp.callbackUrl || "/");
  }

  async function handleLogin(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const nickname = String(formData.get("nickname") ?? "");
    const callbackUrl = String(formData.get("callbackUrl") ?? "/");
    await signIn("demo-email", {
      email,
      nickname,
      redirectTo: callbackUrl || "/",
    });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-10 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-muted/20 p-6 shadow-sm">
        <h1 className="text-xl font-semibold">登录到 Local-Life Agent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Demo 模式：输入任意邮箱即可登录；同一邮箱再次登录会拿回上次的 Memory（行程偏好、对话历史）。
        </p>
        <form action={handleLogin} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="callbackUrl" defaultValue={sp.callbackUrl ?? "/"} />
          <label className="flex flex-col gap-1 text-sm">
            邮箱
            <input
              type="email"
              name="email"
              required
              placeholder="xiaoming@example.com"
              className="rounded-md border border-border/70 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            昵称（选填）
            <input
              type="text"
              name="nickname"
              placeholder="小明"
              className="rounded-md border border-border/70 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
            />
          </label>
          {sp.error ? (
            <p className="rounded-md border border-red-300/50 bg-red-100/30 px-3 py-2 text-xs text-red-700">
              登录失败：{sp.error}
            </p>
          ) : null}
          <button
            type="submit"
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            进入对话
          </button>
        </form>
      </div>
    </main>
  );
}
