import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listNotifications,
  markNotificationsRead,
} from "@/lib/notifications/notifications-store";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

export async function GET() {
  const items = await listNotifications();
  return NextResponse.json({ items });
}

export async function PATCH(req: Request) {
  const json = (await req.json()) as unknown;
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updated = await markNotificationsRead(parsed.data.ids);
  return NextResponse.json({ updated });
}
