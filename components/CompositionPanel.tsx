"use client";

import { useRef, useState } from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import type { Holding } from "@/lib/types";
import { formatPct, toShortDate } from "@/lib/formatters";

ChartJS.register(ArcElement, Tooltip, Legend);

const PALETTE = [
  "#5f2bd7", "#2146a6", "#2f6fe8", "#7a4ce0",
  "#244fca", "#5a78d8", "#7f65ea", "#2f3f8e", "#5c7cff",
];

interface CompositionPanelProps {
  holdings: Holding[];
  asOfDate: string | null;
}

export default function CompositionPanel({ holdings, asOfDate }: CompositionPanelProps) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"png" | "pdf" | null>(null);

  // Pie chart data
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
        borderWidth: 2,
        borderColor: "#ffffff",
        backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom" as const,
        labels: { color: "#56608f", boxWidth: 12, padding: 14, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: "rgba(255, 255, 255, 0.98)",
        titleColor: "#121f5f",
        bodyColor: "#56608f",
        borderColor: "#e9ebf7",
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        boxWidth: 10,
        boxHeight: 10,
        callbacks: {
          label(context: { label?: string; parsed?: number }) {
            return `  ${context.label ?? ""}: ${formatPct(context.parsed ?? 0, 3)}`;
          },
        },
      },
    },
  };

  const maxShare = holdings[0]?.sharePct ?? 1;

  // ── Export handlers ──────────────────────────────────────────────────────────

  const handleExportPng = async () => {
    if (!exportRef.current || exporting) return;
    setExporting("png");
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `ciclo-nova-composicion-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    if (!exportRef.current || exporting) return;
    setExporting("pdf");
    try {
      const { default: html2canvas } = await import("html2canvas");
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const ratio = canvas.height / canvas.width;
      const imgW = pdfW - 20;
      const imgH = imgW * ratio;
      const yOffset = Math.max(30, (pdfH - imgH) / 2);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(18, 31, 95);
      pdf.text("Ciclo Nova · Composición de Cartera", 10, 13);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(86, 96, 143);
      pdf.text(
        `Composición al ${toShortDate(asOfDate)} · Generado el ${new Date().toLocaleString("es-AR")}`,
        10,
        20,
      );

      pdf.addImage(imgData, "PNG", 10, yOffset, imgW, imgH);
      pdf.save(`ciclo-nova-composicion-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <article className="panel composition-panel">
      {/* Header with export buttons */}
      <div className="composition-header">
        <div>
          <h2>Composición de Cartera</h2>
          <p className="muted panel-sub">
            {asOfDate ? `Datos al ${toShortDate(asOfDate)}` : "Fecha no informada"}
          </p>
        </div>
        <div className="export-buttons">
          <button
            className="btn-export btn-export-png"
            onClick={handleExportPng}
            disabled={!!exporting}
          >
            <IconImage />
            {exporting === "png" ? "Exportando…" : "Exportar PNG"}
          </button>
          <button
            className="btn-export btn-export-pdf"
            onClick={handleExportPdf}
            disabled={!!exporting}
          >
            <IconPdf />
            {exporting === "pdf" ? "Exportando…" : "Exportar PDF"}
          </button>
        </div>
      </div>

      {/* Exportable content */}
      <div className="composition-layout" ref={exportRef}>
        {/* Pie chart */}
        <div className="composition-chart-wrap">
          {values.length > 0 ? (
            <Pie data={chartData} options={chartOptions} />
          ) : (
            <p className="muted" style={{ padding: 16 }}>Sin datos.</p>
          )}
        </div>

        {/* Holdings table */}
        <div className="composition-table-wrap">
          {holdings.length === 0 ? (
            <p className="muted">Sin datos de cartera para la fecha consultada.</p>
          ) : (
            <table className="holdings-table">
              <thead>
                <tr>
                  <th className="col-rank">#</th>
                  <th>Activo</th>
                  <th>Distribución</th>
                  <th className="col-pct">%</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((item, idx) => (
                  <tr key={`${item.asset}-${idx}`}>
                    <td className="col-rank holding-rank">{idx + 1}</td>
                    <td className="holding-name">{item.asset}</td>
                    <td className="holding-bar-cell">
                      <div
                        className="holding-bar"
                        style={{
                          width: `${Math.max(3, (item.sharePct / maxShare) * 100)}%`,
                          background: PALETTE[idx % PALETTE.length],
                        }}
                      />
                    </td>
                    <td className="col-pct holding-pct">{formatPct(item.sharePct, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </article>
  );
}

function IconImage() {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function IconPdf() {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}
