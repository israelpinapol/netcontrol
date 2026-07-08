import { NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";
import type { DeviceStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST /api/device  { id, status: "allowed" | "blocked" | "paused" }
export async function POST(req: Request) {
  const { id, status } = (await req.json()) as { id: string; status: DeviceStatus };
  if (!id || !status) return NextResponse.json({ error: "id y status requeridos" }, { status: 400 });
  await getBackend().setDeviceStatus(id, status);
  return NextResponse.json({ ok: true });
}
