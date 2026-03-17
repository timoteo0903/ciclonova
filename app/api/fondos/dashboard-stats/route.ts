import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export interface DashboardStatsData {
  aumByFundArs: { fundName: string; aum: number }[];
  aumByFundUsd: { fundName: string; aum: number }[];
  aumHistoryArs: { date: string; total: number }[];
  aumHistoryUsd: { date: string; total: number }[];
  aumHistoryPesificado: { date: string; total: number }[];
  dolarOficial: number | null;
}

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase no disponible" }, { status: 500 });
  }

  // Las tres consultas y el dólar en paralelo
  const [aumPorFondoRes, aumHistoryRes, dolarRes] = await Promise.all([
    // Vista 1: AUM actual por fondo (última foto de cada clase sumada)
    supabase
      .from("mv_aum_por_fondo")
      .select("fund_name, moneda, aum_total")
      .order("aum_total", { ascending: false }),

    // Vista 2: Evolución diaria ya con forward-fill aplicado
    supabase
      .from("mv_aum_history_90d")
      .select("fecha, moneda, aum_total")
      .order("fecha", { ascending: true }),

    // Dólar oficial
    fetch("https://dolarapi.com/v1/dolares/oficial", {
      signal: AbortSignal.timeout(5000),
    }).then((r) => r.ok ? r.json() : null).catch(() => null),
  ]);

  const aumPorFondo = aumPorFondoRes.data ?? [];
  const aumHistory  = aumHistoryRes.data  ?? [];

  const dolarOficial: number | null =
    (dolarRes as { venta?: number; compra?: number } | null)?.venta ??
    (dolarRes as { venta?: number; compra?: number } | null)?.compra ??
    null;

  const aumByFundArs = aumPorFondo
    .filter((r) => r.moneda === "ARS")
    .map((r) => ({ fundName: r.fund_name, aum: r.aum_total as number }));

  const aumByFundUsd = aumPorFondo
    .filter((r) => r.moneda === "USD")
    .map((r) => ({ fundName: r.fund_name, aum: r.aum_total as number }));

  const aumHistoryArs = aumHistory
    .filter((r) => r.moneda === "ARS")
    .map((r) => ({ date: String(r.fecha), total: r.aum_total as number }));

  const aumHistoryUsd = aumHistory
    .filter((r) => r.moneda === "USD")
    .map((r) => ({ date: String(r.fecha), total: r.aum_total as number }));

  const aumHistoryPesificado = dolarOficial
    ? aumHistoryArs.map(({ date, total }) => ({ date, total: total / dolarOficial }))
    : [];

  const data: DashboardStatsData = {
    aumByFundArs,
    aumByFundUsd,
    aumHistoryArs,
    aumHistoryUsd,
    aumHistoryPesificado,
    dolarOficial,
  };

  return NextResponse.json(
    { success: true, data },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
