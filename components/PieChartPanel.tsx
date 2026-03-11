"use client";

import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import type { Holding } from "@/lib/types";
import { formatPct, toShortDate } from "@/lib/formatters";

ChartJS.register(ArcElement, Tooltip, Legend);

const PALETTE = [
  "#5f2bd7", "#2146a6", "#2f6fe8", "#7a4ce0",
  "#244fca", "#5a78d8", "#7f65ea", "#2f3f8e", "#5c7cff",
];

interface PieChartPanelProps {
  holdings: Holding[];
  asOfDate: string | null;
}

export default function PieChartPanel({ holdings, asOfDate }: PieChartPanelProps) {
  const pieBase = holdings.slice(0, 8);
  const labels = pieBase.map((h) => h.asset);
  const values = pieBase.map((h) => Number(h.sharePct ?? 0));
  const remainder = holdings.slice(8).reduce((sum, h) => sum + Number(h.sharePct ?? 0), 0);
  if (remainder > 0.0001) {
    labels.push("Resto de activos");
    values.push(remainder);
  }

  const chartData = {
    labels,
    datasets: [
      {
        data: values,
        borderWidth: 1,
        borderColor: "#ffffff",
        backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: { color: "#5b6287", boxWidth: 12, padding: 12, font: { size: 11 } },
      },
      tooltip: {
        callbacks: {
          label(context: { label?: string; parsed?: number }) {
            return `${context.label ?? ""}: ${formatPct(context.parsed ?? 0, 3)}`;
          },
        },
      },
    },
  };

  return (
    <article className="panel panel--wide">
      <h2>Top Activos en Cartera</h2>
      <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
        {asOfDate ? `Composición al ${toShortDate(asOfDate)}` : "Fecha de cartera no informada"}
      </p>
      <div className="portfolio-layout">
        <div className="portfolio-pie-wrap">
          {values.length > 0 && <Pie data={chartData} options={options} />}
        </div>
        <ol className="portfolio-list">
          {holdings.length === 0 ? (
            <li className="portfolio-item">Sin datos de cartera para la fecha consultada.</li>
          ) : (
            holdings.map((item) => (
              <li key={item.asset} className="portfolio-item">
                {item.asset}{" "}
                <span className="portfolio-share">({formatPct(item.sharePct, 3)})</span>
              </li>
            ))
          )}
        </ol>
      </div>
    </article>
  );
}
