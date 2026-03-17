import { NextRequest, NextResponse } from "next/server";
import { refreshAllFundsToday } from "@/lib/multi-fund";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.REFRESH_SECRET;
  if (!secret) return true;
  return req.headers.get("x-refresh-secret") === secret;
}

/**
 * POST /api/fondos/refresh-all
 *
 * Actualiza el VCP y AUM del día para los 96 clases en ieb_fondos_diario.
 * Llamar nocturnamente (ej. GitHub Actions cron o Vercel Cron Jobs).
 *
 * Header opcional: x-refresh-secret: <REFRESH_SECRET>
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await refreshAllFundsToday();
    return NextResponse.json({
      at: new Date().toISOString(),
      synced: result.synced,
      failed: result.failed,
      details: result.details,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en refresh-all" },
      { status: 502 },
    );
  }
}
