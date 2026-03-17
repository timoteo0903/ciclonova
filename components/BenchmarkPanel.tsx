"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { BenchmarkData } from "@/lib/types";
import { formatPct, toShortDate } from "@/lib/formatters";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface Props {
  data: BenchmarkData;
}

export default function BenchmarkPanel({ data }: Props) {
  const { series, startDate, endDate } = data;
  if (!series.length) return <p className="muted">Sin datos para mostrar.</p>;

  // Alinear todas las series en un eje de fechas común
  const allDates = Array.from(
    new Set(series.flatMap((s) => s.points.map((p) => p.date))),
  ).sort();

  const labels = allDates.map(toShortDate);

  const datasets = series.map((s) => {
    const byDate = new Map(s.points.map((p) => [p.date, p.returnPct]));
    return {
      label: `${s.fundName} (${s.className})`,
      data: allDates.map((d) => byDate.get(d) ?? null),
      borderColor: s.color,
      backgroundColor: s.color + "22",
      borderWidth: 2,
      pointRadius: 0,
      pointHitRadius: 8,
      tension: 0.1,
      spanGaps: true,
    };
  });

  const chartData = { labels, datasets };

  const options = {
    animation: { duration: 400 } as const,
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        display: true,
        position: "bottom" as const,
        labels: {
          boxWidth: 14,
          padding: 14,
          font: { size: 12 },
          color: "#56608f",
        },
      },
      tooltip: {
        backgroundColor: "rgba(255,255,255,0.98)",
        borderColor: "#e9ebf7",
        borderWidth: 1,
        titleColor: "#56608f",
        bodyColor: "#0d1435",
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            if (ctx.parsed.y === null) return "";
            return ` ${ctx.dataset.label}: ${formatPct(ctx.parsed.y)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: "#f0f2fb" },
        ticks: { maxTicksLimit: 8, color: "#56608f", font: { size: 11 } },
      },
      y: {
        grid: { color: "#f0f2fb" },
        ticks: {
          color: "#56608f",
          font: { size: 11 },
          callback: (v: number | string) => formatPct(typeof v === "number" ? v : null),
        },
      },
    },
  };

  // Tabla de resumen de rendimientos
  const sorted = [...series].sort(
    (a, b) => (b.inceptionReturnPct ?? -Infinity) - (a.inceptionReturnPct ?? -Infinity),
  );

  return (
    <div className="benchmark-panel">
      {/* Resumen rango */}
      <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        {toShortDate(startDate)} — {toShortDate(endDate)} · {series.length} fondos
      </p>

      {/* Gráfico */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Rendimiento acumulado normalizado (%)</h2>
          <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            Base 0% en el primer punto disponible de cada fondo
          </p>
        </div>
        <div style={{ height: 420 }}>
          <Line data={chartData} options={options} />
        </div>
      </div>

      {/* Tabla ranking */}
      <div className="panel">
        <div className="panel-head">
          <h2>Ranking de rendimiento en el período</h2>
        </div>
        <table className="benchmark-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Fondo</th>
              <th>Clase</th>
              <th>Rendimiento acumulado</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={s.classId}>
                <td className="bench-rank">{i + 1}</td>
                <td className="bench-name">{s.fundName}</td>
                <td className="bench-class">{s.className}</td>
                <td
                  className={`bench-return ${
                    (s.inceptionReturnPct ?? 0) > 0
                      ? "positive"
                      : (s.inceptionReturnPct ?? 0) < 0
                      ? "negative"
                      : ""
                  }`}
                >
                  {formatPct(s.inceptionReturnPct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

