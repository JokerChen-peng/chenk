import { NextResponse } from "next/server";
import { z } from "zod";
import { listSavedPlans, upsertSavedPlan } from "@/lib/plans/plan-file-store";

export const dynamic = "force-dynamic";

const segmentSchema = z.object({
  segment_id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().min(1),
  poi_id: z.string().optional(),
  start_time_iso: z.string().min(1),
  end_time_iso: z.string().min(1),
  estimated_cost_cny: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

const postBodySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  segments: z.array(segmentSchema).min(1),
  total_estimated_cost_cny: z.number().nonnegative().optional(),
  budget_total_cny: z.number().nonnegative().optional(),
});

export async function GET() {
  try {
    const plans = await listSavedPlans();
    return NextResponse.json({ plans });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to list plans" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const json: unknown = await req.json();
    const parsed = postBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const plan = await upsertSavedPlan(parsed.data);
    return NextResponse.json({ plan });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to save plan" },
      { status: 500 },
    );
  }
}
