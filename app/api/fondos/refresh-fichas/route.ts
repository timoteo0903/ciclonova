import { NextRequest, NextResponse } from "next/server";
import { refreshAllFichaSnapshots } from "@/lib/multi-fund";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.REFRESH_SECRET;
  if (!secret) return true;
  return req.headers.get("x-refresh-secret") === secret;
}

/**
 * POST /api/fondos/refresh-fichas
 *
 * Descarga la ficha (Clase A) de cada fondo desde CAFCI y la guarda en
 * cafci_ficha_snapshot. Correr al menos una vez por día (junto con refresh-all)
 * para que el dashboard nunca consulte CAFCI en tiempo real.
 *
 * Header opcional: x-refresh-secret: <REFRESH_SECRET>
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await refreshAllFichaSnapshots();
    return NextResponse.json({
      at: new Date().toISOString(),
      ok: result.ok,
      failed: result.failed,
      details: result.details,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error en refresh-fichas" },
      { status: 502 },
    );
  }
}
