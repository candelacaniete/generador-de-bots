import { NextRequest, NextResponse } from "next/server";
import { expirarTurnosPendientes } from "@/lib/bookings";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Cron: Vercel Cron o llamada manual con header Authorization: Bearer CRON_SECRET
 */
export async function GET(req: NextRequest) {
  const secret = env("CRON_SECRET");
  const auth = req.headers.get("authorization");
  const vercelCron = req.headers.get("x-vercel-cron");

  if (secret) {
    if (auth !== `Bearer ${secret}` && !vercelCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const count = await expirarTurnosPendientes();
    return NextResponse.json({ ok: true, expirados: count });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
