import { NextRequest, NextResponse } from "next/server";
import { getMultiFundDashboard } from "@/lib/multi-fund";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fundId: string }> },
) {
  const { fundId: fundIdStr } = await params;
  const fundId = Number(fundIdStr);
  if (!Number.isFinite(fundId) || fundId <= 0) {
    return NextResponse.json({ error: "fundId inválido" }, { status: 400 });
  }

  const days = request.nextUrl.searchParams.get("days") ?? "30";

  try {
    const data = await getMultiFundDashboard(fundId, days);
    return NextResponse.json({ success: true, data }, {
      headers: {
        // Caché en browser/CDN: sirve el dato por 5 min, acepta hasta 10 min stale mientras revalida en background
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al consultar el fondo" },
      { status: 502 },
    );
  }
}
