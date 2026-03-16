import { NextRequest, NextResponse } from "next/server";
import { getDashboardClassesData, CLASS_A_ID, CLASS_B_ID } from "@/lib/cafci";
import type { DashboardClassesData } from "@/lib/types";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DASHBOARD_CACHE_TTL_MS = 23 * 60 * 60 * 1000;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.REFRESH_SECRET;
  if (!secret) return true;
  return req.headers.get("x-refresh-secret") === secret;
}

// Convierte "DD/MM/YYYY" → "YYYY-MM-DD". Devuelve null si no puede parsear.
function parseArgDate(s: string | null): string | null {
  if (!s) return null;
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
}

// Sincroniza ciclo_nova_diario con los puntos de evolución
// MÁS el punto del día actual desde la ficha (que la API de evolución publica con 1 día de lag).
async function syncDiario(data: DashboardClassesData) {
  if (!supabase) return;

  const rows = [
    ...data.classA.evolution.points.map((p) => ({
      fecha: p.date,
      class_id: CLASS_A_ID,
      vcp: p.vcp,
      aum: p.aum,
      ccp: p.ccp,
    })),
    ...data.classB.evolution.points.map((p) => ({
      fecha: p.date,
      class_id: CLASS_B_ID,
      vcp: p.vcp,
      aum: p.aum,
      ccp: p.ccp,
    })),
  ];

  // Agregar el punto del día actual desde el overview de la ficha.
  // La API de evolución tiene 1 día de lag; la ficha siempre tiene el dato del día.
  const fechaA = parseArgDate(data.classA.overview.asOfDate);
  const fechaB = parseArgDate(data.classB.overview.asOfDate);

  if (fechaA) {
    rows.push({
      fecha: fechaA,
      class_id: CLASS_A_ID,
      vcp: data.classA.overview.current.vcpPorMil,
      aum: data.classA.overview.current.aum,
      ccp: null,
    });
  }
  if (fechaB) {
    rows.push({
      fecha: fechaB,
      class_id: CLASS_B_ID,
      vcp: data.classB.overview.current.vcpPorMil,
      aum: data.classB.overview.current.aum,
      ccp: null,
    });
  }

  if (!rows.length) return;

  // Deduplicar por (fecha, class_id) — el punto actual sobreescribe si ya existe
  const deduped = [...new Map(rows.map((r) => [`${r.fecha}|${r.class_id}`, r])).values()];

  const { error } = await supabase
    .from("ciclo_nova_diario")
    .upsert(deduped, { onConflict: "fecha,class_id" });

  if (error) throw new Error(`ciclo_nova_diario upsert: ${error.message}`);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!supabase) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  }

  let diarioRows = 0;
  let cacheError: string | null = null;
  let diarioError: string | null = null;

  try {
    // Fetch completo desde CAFCI (usa "all" para tener toda la historia)
    const data = await getDashboardClassesData("all");

    // 1. Guardar cache del dashboard (para overview/fees/portfolio)
    const { error } = await supabase.from("cafci_dashboard_cache").upsert(
      {
        cache_key: "classes:all",
        data,
        computed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + DASHBOARD_CACHE_TTL_MS).toISOString(),
      },
      { onConflict: "cache_key" },
    );
    if (error) cacheError = error.message;

    // 2. Sincronizar tabla diaria (fuente para gráficos y rendimientos)
    try {
      await syncDiario(data);
      diarioRows = data.classA.evolution.points.length + data.classB.evolution.points.length;
    } catch (err) {
      diarioError = err instanceof Error ? err.message : "error";
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al consultar CAFCI" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    at: new Date().toISOString(),
    diarioRows,
    ...(cacheError ? { cacheError } : {}),
    ...(diarioError ? { diarioError } : {}),
  });
}
