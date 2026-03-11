"use client";

import { useCallback } from "react";
import { Line } from "react-chartjs-2";
import type { Chart as ChartJSType, Plugin, TooltipItem, TooltipModel } from "chart.js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { fmtNumber2, fmtNumber4, fmtCurrencyArs } from "@/lib/formatters";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

// ── Crosshair plugin ──────────────────────────────────────────────────────────

const crosshairPlugin: Plugin<"line"> = {
  id: "crosshair",
  afterDraw(chart) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const active = (chart.tooltip as any)?._active as { element: { x: number } }[] | undefined;
    if (!active?.length) return;
    const ctx = chart.ctx;
    const x = active[0].element.x;
    const { top, bottom } = chart.chartArea;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.strokeStyle = "rgba(95, 43, 215, 0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

interface LineChartPanelProps {
  title: string;
  rangeLabel: string;
  labels: string[];
  data: (number | null)[];
  color: string;
  seriesLabel: string;
  currency?: boolean;
  className?: string;
}

export default function LineChartPanel({
  title,
  rangeLabel,
  labels,
  data,
  color,
  seriesLabel,
  currency = false,
  className,
}: LineChartPanelProps) {
  // External tooltip — attached to the chart-canvas-wrap (position: relative)
  const externalTooltip = useCallback(
    (context: { chart: ChartJSType; tooltip: TooltipModel<"line"> }) => {
      const { chart, tooltip } = context;
      const parent = chart.canvas.parentElement as HTMLElement;

      let el = parent.querySelector<HTMLDivElement>(".chart-tooltip");
      if (!el) {
        el = document.createElement("div");
        el.className = "chart-tooltip";
        parent.appendChild(el);
      }

      if (tooltip.opacity === 0) {
        el.style.opacity = "0";
        return;
      }

      const titleStr = tooltip.title?.[0] ?? "";
      const value = tooltip.body?.[0]?.lines?.[0] ?? "";

      el.innerHTML = `<span class="ct-date">${titleStr}</span><span class="ct-val">${value}</span>`;
      el.style.opacity = "1";
      el.style.left = `${tooltip.caretX}px`;
      el.style.top = `${tooltip.caretY - 68}px`;
    },
    [currency], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const chartData = {
    labels,
    datasets: [
      {
        label: seriesLabel,
        data,
        borderColor: color,
        backgroundColor: `${color}18`,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: "#ffffff",
        pointHoverBorderWidth: 2,
        tension: 0.24,
        fill: true,
      },
    ],
  };

  const options = {
    animation: { duration: 600 },
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: false,
        external: externalTooltip,
        callbacks: {
          label(context: TooltipItem<"line">) {
            const y = context.parsed.y;
            if (y == null) return "Sin dato";
            return currency ? fmtCurrencyArs.format(y) : fmtNumber4.format(y);
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: "#f0f2fb" },
        ticks: {
          maxTicksLimit: 8,
          color: "#5b6287",
          autoSkip: true,
          font: { size: 11 },
        },
      },
      y: {
        grid: { color: "#f0f2fb" },
        ticks: {
          color: "#5b6287",
          font: { size: 11 },
          callback(value: number | string) {
            const num = Number(value);
            return currency ? fmtNumber2.format(num) : fmtNumber4.format(num);
          },
        },
      },
    },
  };

  return (
    <article className={className ? `panel ${className}` : "panel"}>
      <div className="panel-head">
        <h2>{title}</h2>
        <p className="muted panel-sub">{rangeLabel}</p>
      </div>
      <div className="chart-canvas-wrap">
        <Line data={chartData} options={options} plugins={[crosshairPlugin]} />
      </div>
    </article>
  );
}
