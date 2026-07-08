import { NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

// POST /api/speedtest -> ejecuta un test de velocidad en el backend
export async function POST() {
  const result = await getBackend().runSpeedTest();
  return NextResponse.json(result);
}
