import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listPlanSnapshots,
  rollbackToSnapshot,
} from "@/lib/plans/plan-file-store";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  snapshot_id: z.string().min(8),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const snapshots = await listPlanSnapshots(id);
  return NextResponse.json({ snapshots });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const json = (await req.json()) as unknown;
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const plan = await rollbackToSnapshot({
    id,
    snapshot_id: parsed.data.snapshot_id,
  });
  if (!plan) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ plan });
}
