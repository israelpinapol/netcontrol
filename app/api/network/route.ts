import { NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

// GET /api/network -> snapshot completo de la red
export async function GET() {
  const snapshot = await getBackend().getSnapshot();
  return NextResponse.json(snapshot);
}
