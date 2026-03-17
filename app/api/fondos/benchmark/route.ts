import { NextRequest, NextResponse } from "next/server";
import { getBenchmarkData } from "@/lib/multi-fund";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const fundsParam = request.nextUrl.searchParams.get("funds") ?? "";
  const days = request.nextUrl.searchParams.get("days") ?? "180";

  const fundIds = fundsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (fundIds.length === 0) {
    return NextResponse.json({ error: "Se requiere al menos un fundId en ?funds=1717,891,..." }, { status: 400 });
  }

  try {
    const data = await getBenchmarkData(fundIds, days);
    return NextResponse.json({ success: true, data }, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al armar benchmark" },
      { status: 502 },
    );
  }
}
