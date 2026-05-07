import { NextResponse } from "next/server";
import { z } from "zod";
import { rollbackBundle } from "@/lib/plans/transaction-audit-store";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  bundle_id: z.string().min(8),
  reason: z.string().min(1).max(160).optional(),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", details: (e as Error).message },
      { status: 400 },
    );
  }
  const updated = await rollbackBundle(parsed);
  if (!updated) {
    return NextResponse.json(
      { error: "bundle_not_found", bundle_id: parsed.bundle_id },
      { status: 404 },
    );
  }
  return NextResponse.json({
    ok: true,
    bundle_id: updated.bundle_id,
    rolled_back_at: updated.rolled_back_at,
    rollback_reason: updated.rollback_reason,
  });
}
