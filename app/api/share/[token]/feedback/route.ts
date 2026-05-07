import { NextResponse } from "next/server";
import { z } from "zod";
import {
  appendFeedback,
  listFeedbackForToken,
} from "@/lib/share/share-feedback-store";
import { decodeShareToken } from "@/lib/share/share-outing-payload";

export const dynamic = "force-dynamic";

const postBodySchema = z.object({
  reaction: z.enum(["thumbs_up", "thumbs_down", "neutral"]),
  comment: z.string().max(400).optional(),
  reviewer_label: z.string().max(40).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const decoded = decodeShareToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }
  const items = await listFeedbackForToken(token);
  return NextResponse.json({ token, items });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const decoded = decodeShareToken(token);
  if (!decoded) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }
  const json = (await req.json()) as unknown;
  const parsed = postBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const entry = await appendFeedback({
    token,
    reaction: parsed.data.reaction,
    comment: parsed.data.comment,
    reviewer_label: parsed.data.reviewer_label,
  });
  return NextResponse.json({ entry });
}
