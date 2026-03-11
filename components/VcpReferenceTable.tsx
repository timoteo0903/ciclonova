import type { Overview, EvolutionStats } from "@/lib/types";
import { formatNumber, formatPct } from "@/lib/formatters";

interface Props {
  label: string;
  overview: Overview | null;
  inceptionStats: EvolutionStats | null;
}

interface Row {
  description: string;
  date: string | null;
  vcp: number | null;
  variationPct: number | null;
}

function deriveVcp(current: number | null, returnPct: number | null): number | null {
  if (current == null || returnPct == null) return null;
  return current / (1 + returnPct / 100);
}

export default function VcpReferenceTable({ label, overview, inceptionStats }: Props) {
  const currentVcp = overview?.current.vcpUnitario ?? null;
  const returns = overview?.returns;

  const rows: Row[] = [
    {
      description: "Valor del Día",
      date: overview?.asOfDate ?? null,
      vcp: currentVcp,
      variationPct: null,
    },
    {
      description: "Valor Día Anterior",
      date: returns?.day?.sinceDate ?? null,
      vcp: deriveVcp(currentVcp, returns?.day?.returnPct ?? null),
      variationPct: returns?.day?.returnPct ?? null,
    },
    {
      description: "Valor Cierre Mes Anterior",
      date: returns?.month?.sinceDate ?? null,
      vcp: deriveVcp(currentVcp, returns?.month?.returnPct ?? null),
      variationPct: returns?.month?.returnPct ?? null,
    },
    {
      description: "Valor Cierre Año Anterior",
      date: returns?.year?.sinceDate ?? null,
      vcp: deriveVcp(currentVcp, returns?.year?.returnPct ?? null),
      variationPct: returns?.year?.returnPct ?? null,
    },
    {
      description: "Valor Inicio de Operaciones",
      date: overview?.fund.createdAt ?? null,
      vcp: deriveVcp(currentVcp, inceptionStats?.sinceInceptionReturnPct ?? null),
      variationPct: inceptionStats?.sinceInceptionReturnPct ?? null,
    },
  ];

  return (
    <div className="panel vcp-ref-panel">
      <p className="eyebrow" style={{ margin: "0 0 14px" }}>{label}</p>
      <div className="composition-table-wrap" style={{ maxHeight: "none" }}>
        <table className="holdings-table">
          <thead>
            <tr>
              <th>Descripción</th>
              <th>Fecha</th>
              <th style={{ textAlign: "right" }}>Valor Cuotaparte</th>
              <th style={{ textAlign: "right" }}>Variación</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isPositive = row.variationPct != null && row.variationPct > 0;
              const isNegative = row.variationPct != null && row.variationPct < 0;
              return (
                <tr key={row.description}>
                  <td className="holding-name">{row.description}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{row.date ?? "-"}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "var(--navy)", fontFamily: "var(--font-sora), 'Sora', sans-serif" }}>
                    {row.vcp != null ? formatNumber(row.vcp, 4) : "-"}
                  </td>
                  <td
                    style={{
                      textAlign: "right",
                      fontWeight: 700,
                      fontSize: 13,
                      color: isPositive ? "var(--ok)" : isNegative ? "var(--danger)" : "var(--ink-soft)",
                    }}
                  >
                    {row.variationPct != null ? formatPct(row.variationPct) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
