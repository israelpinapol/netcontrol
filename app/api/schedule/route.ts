import { NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

// POST /api/schedule  { id, enabled }
export async function POST(req: Request) {
  const { id, enabled } = (await req.json()) as { id: string; enabled: boolean };
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
  await getBackend().toggleSchedule(id, enabled);
  return NextResponse.json({ ok: true });
}
