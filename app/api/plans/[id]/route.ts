import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteSavedPlan,
  getSavedPlan,
  updateSavedPlanTitle,
} from "@/lib/plans/plan-file-store";

export const dynamic = "force-dynamic";

const patchBodySchema = z.object({
  title: z.string().min(1).max(200),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const plan = await getSavedPlan(id);
    if (!plan) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ plan });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to load plan" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const json: unknown = await req.json();
    const parsed = patchBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const plan = await updateSavedPlanTitle(id, parsed.data.title);
    if (!plan) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ plan });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to update plan" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const ok = await deleteSavedPlan(id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to delete plan" },
      { status: 500 },
    );
  }
}
