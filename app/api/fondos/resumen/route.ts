import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY no configurada en el servidor" },
      { status: 500 },
    );
  }

  const body = await request.json();
  const {
    fundName,
    period,
    vcpInicio,
    vcpFin,
    returnPct,
    aumInicio,
    aumFin,
    aumChangePct,
    maxDrawdown,
    volatility,
    points,
    dateInicio,
    dateFin,
  } = body;

  const periodLabel =
    period === "all"
      ? "desde inicio de datos disponibles"
      : period === "30"
        ? "los últimos 30 días"
        : period === "90"
          ? "los últimos 90 días"
          : period === "180"
            ? "los últimos 180 días"
            : `los últimos ${period} días`;

  const fmt = (n: number | null | undefined, decimals = 2) =>
    n != null ? n.toFixed(decimals) : "N/D";
  const fmtCurrency = (n: number | null | undefined) =>
    n != null
      ? n >= 1e9
        ? `$${(n / 1e9).toFixed(2)} MM`
        : n >= 1e6
          ? `$${(n / 1e6).toFixed(2)} M`
          : `$${n.toFixed(0)}`
      : "N/D";

  const prompt = `Sos un analista de fondos comunes de inversión argentinos. Describí en 2-3 oraciones cortas y directas cómo se comportó el fondo "${fundName}" durante ${periodLabel} (${dateInicio ?? "N/D"} al ${dateFin ?? "N/D"}).

Datos del período:
- Valor cuotaparte inicio: ${fmt(vcpInicio, 4)}
- Valor cuotaparte fin: ${fmt(vcpFin, 4)}
- Variación VCP: ${returnPct != null ? `${returnPct > 0 ? "+" : ""}${fmt(returnPct)}%` : "N/D"}
- AUM inicio: ${fmtCurrency(aumInicio)}
- AUM fin: ${fmtCurrency(aumFin)}
- Variación AUM: ${aumChangePct != null ? `${aumChangePct > 0 ? "+" : ""}${fmt(aumChangePct)}%` : "N/D"}
- Máximo drawdown: ${maxDrawdown != null ? `${fmt(maxDrawdown)}%` : "N/D"}
- Volatilidad anualizada (30d): ${volatility != null ? `${fmt(volatility)}%` : "N/D"}
- Observaciones en el período: ${points ?? "N/D"}

Usá lenguaje simple y directo. Sin bullet points, solo texto corrido. No enumeres los datos exactos, interpretá la tendencia y el contexto. Mencioná si el fondo subió o bajó, cómo varió el patrimonio, y si hubo volatilidad notable.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 350,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message ?? `Error HTTP ${response.status}`);
    }

    const text: string = data.content?.[0]?.text ?? "";
    return NextResponse.json({ success: true, summary: text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error desconocido" },
      { status: 502 },
    );
  }
}
