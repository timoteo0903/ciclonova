import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ALL_FUNDS } from "@/lib/funds-config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface MetricaFondo {
  fundId: number;
  fundName: string;
  originalName: string;
  moneda: "ARS" | "USD";
  classId: number;
  className: string;
  returnPct: number | null;
  vcpInicio: number | null;
  vcpFin: number | null;
  aumFin: number | null;
  aumInicio: number | null;
  aumChangePct: number | null;
  dateInicio: string | null;
  dateFin: string | null;
}

export async function GET(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ error: "Supabase no disponible" }, { status: 500 });
  }

  const days = Number(request.nextUrl.searchParams.get("days") ?? "30");

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);
  const startIso = startDate.toISOString().split("T")[0];

  const results = await Promise.all(
    ALL_FUNDS.map(async (fund): Promise<MetricaFondo | null> => {
      if (fund.classes.length === 0) return null;
      const firstClass = fund.classes[0];
      const classId = firstClass.classId;

      const [latestRes, earliestRes] = await Promise.all([
        supabase!
          .from("ieb_fondos_diario")
          .select("fecha, vcp, aum")
          .eq("clase_id", classId)
          .not("vcp", "is", null)
          .order("fecha", { ascending: false })
          .limit(1),
        supabase!
          .from("ieb_fondos_diario")
          .select("fecha, vcp, aum")
          .eq("clase_id", classId)
          .gte("fecha", startIso)
          .not("vcp", "is", null)
          .order("fecha", { ascending: true })
          .limit(1),
      ]);

      const latestRow = latestRes.data?.[0] ?? null;
      const earliestRow = earliestRes.data?.[0] ?? null;

      if (!latestRow) return null;

      const vcpFin = latestRow.vcp as number | null;
      const vcpInicio = earliestRow?.vcp as number | null ?? null;
      const aumFin = latestRow.aum as number | null;
      const aumInicio = earliestRow?.aum as number | null ?? null;

      const returnPct =
        vcpInicio != null && vcpFin != null && vcpInicio !== 0
          ? ((vcpFin / vcpInicio) - 1) * 100
          : null;

      const aumChangePct =
        aumInicio != null && aumFin != null && aumInicio !== 0
          ? ((aumFin / aumInicio) - 1) * 100
          : null;

      return {
        fundId: fund.fundId,
        fundName: fund.fundName,
        originalName: fund.originalName,
        moneda: fund.moneda,
        classId,
        className: firstClass.className,
        returnPct,
        vcpInicio,
        vcpFin,
        aumFin,
        aumInicio,
        aumChangePct,
        dateInicio: earliestRow?.fecha as string | null ?? null,
        dateFin: latestRow.fecha as string | null,
      };
    }),
  );

  const valid = results.filter((r): r is MetricaFondo => r !== null);

  return NextResponse.json({ success: true, data: valid, period: days });
}
