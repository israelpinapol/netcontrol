import { NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

// POST /api/access  { mac, grant }  -> admite (grant=true) o deja en cuarentena (false)
export async function POST(req: Request) {
  const { mac, grant } = (await req.json()) as { mac: string; grant: boolean };
  if (!mac) return NextResponse.json({ error: "mac requerido" }, { status: 400 });
  await getBackend().setAccess(mac, grant);
  return NextResponse.json({ ok: true });
}
