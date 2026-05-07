import Link from "next/link";
import { decodeShareToken } from "@/lib/share/share-outing-payload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShareFeedbackForm } from "@/components/share/share-feedback-form";

function audienceLabel(a: "family" | "friends" | "other"): string {
  switch (a) {
    case "family":
      return "家人";
    case "friends":
      return "朋友";
    default:
      return "亲友";
  }
}

export default async function ShareOutingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = decodeShareToken(token);

  if (!data) {
    return (
      <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
        <Card className="mx-auto max-w-lg border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">链接无效或已过期</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            请让对方重新从对话里生成分享链接（Demo 预览仅用于本地演示）。
            <p className="mt-4">
              <Link href="/" className="text-primary underline">
                返回首页
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-6 text-foreground md:p-10">
      <div className="mx-auto max-w-lg space-y-4">
        <p className="text-center text-xs text-muted-foreground">
          只读预览 · Mock 亲友视图 · 非正式订单页
        </p>
        <Card className="border-border/70 shadow-md">
          <CardHeader className="border-b border-border/60 pb-3">
            <p className="text-xs font-medium text-muted-foreground">
              给「{data.recipient_label}」看 · {audienceLabel(data.audience)}
            </p>
            <CardTitle className="text-lg leading-snug">{data.headline}</CardTitle>
            <p className="text-xs text-muted-foreground">
              生成时间 {new Date(data.created_at).toLocaleString("zh-CN")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <ul className="list-inside list-disc space-y-2 text-[15px] leading-relaxed">
              {data.bullets.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <ShareFeedbackForm token={token} />
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/" className="text-primary underline">
            打开完整助手
          </Link>
        </p>
      </div>
    </main>
  );
}
