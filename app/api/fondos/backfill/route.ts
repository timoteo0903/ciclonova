import { NextRequest, NextResponse } from "next/server";
import { backfillAllFundsRange } from "@/lib/multi-fund";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.REFRESH_SECRET;
  if (!secret) return true;
  return req.headers.get("x-refresh-secret") === secret;
}

/**
 * POST /api/fondos/backfill
 *
 * Carga historial desde la API de CAFCI para todas las clases.
 *
 * Body JSON opcional:
 *   { "from": "2025-01-01", "to": "2025-12-31", "fundId": 1717 }
 *
 * - from/to: rango de fechas (por defecto: 2025-01-01 → hoy)
 * - fundId: si se especifica, solo backfill de ese fondo
 *
 * El endpoint corre en chunks: llama max 3 clases a la vez para
 * no saturar la API de CAFCI.
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { from?: string; to?: string; fundId?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const fromDate = body.from ?? "2025-01-01";
  const toDate = body.to ?? new Date().toISOString().slice(0, 10);
  const filterFundId = body.fundId ? Number(body.fundId) : null;

  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!ISO_RE.test(fromDate) || !ISO_RE.test(toDate)) {
    return NextResponse.json({ error: "Fechas deben ser YYYY-MM-DD" }, { status: 400 });
  }

  const { upserted, skipped, errors } = await backfillAllFundsRange(fromDate, toDate, filterFundId);

  return NextResponse.json({
    at: new Date().toISOString(),
    from: fromDate,
    to: toDate,
    totalUpserted: upserted,
    totalSkipped: skipped,
    ...(errors.length ? { errors } : {}),
  });
}
