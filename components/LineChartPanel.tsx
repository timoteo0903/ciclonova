"use client";

import { useCallback, useMemo } from "react";
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
  pct?: boolean;
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
  pct = false,
  className,
}: LineChartPanelProps) {

  // ── ATH (solo para gráficos de rendimiento %) ────────────────────────────
  const athIndex = useMemo(() => {
    if (!pct) return -1;
    let best = -1;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === null) continue;
      if (best === -1 || (data[i] as number) > (data[best] as number)) best = i;
    }
    return best;
  }, [data, pct]);

  const athValue = athIndex >= 0 ? (data[athIndex] as number) : null;
  const athLabel = labels[athIndex] ?? "";

  // Plugin que dibuja la línea horizontal y el badge "ATH"
  const athPlugin = useMemo((): Plugin<"line"> => ({
    id: "athLine",
    afterDraw(chart) {
      if (athValue === null) return;
      const ctx = chart.ctx;
      const yScale = chart.scales.y;
      const { left, right, top } = chart.chartArea;
      const y = yScale.getPixelForValue(athValue);

      // Línea punteada horizontal
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.strokeStyle = "rgba(220, 140, 0, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();

      // Badge "ATH"
      const badgeText = `ATH  ${fmtNumber2.format(athValue)} %`;
      const badgePad = 6;
      ctx.font = "bold 11px system-ui, sans-serif";
      const textW = ctx.measureText(badgeText).width;
      const bx = right - textW - badgePad * 2 - 4;
      const by = Math.max(top + 4, y - 22);
      const bh = 20;

      ctx.fillStyle = "rgba(220, 140, 0, 0.12)";
      ctx.strokeStyle = "rgba(220, 140, 0, 0.6)";
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.roundRect(bx, by, textW + badgePad * 2, bh, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#b86a00";
      ctx.fillText(badgeText, bx + badgePad, by + 13);
      ctx.restore();
    },
  }), [athValue]);

  // ── Tooltip externo ───────────────────────────────────────────────────────
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

  // ── Dataset ───────────────────────────────────────────────────────────────
  const pointRadii = useMemo(
    () => data.map((_, i) => (i === athIndex ? 6 : 0)),
    [data, athIndex],
  );
  const pointColors = useMemo(
    () => data.map((_, i) => (i === athIndex ? "#e07b00" : "transparent")),
    [data, athIndex],
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
        pointRadius: pct ? pointRadii : 0,
        pointBackgroundColor: pct ? pointColors : color,
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
            if (currency) return fmtCurrencyArs.format(y);
            if (pct) return `${fmtNumber2.format(y)} %`;
            return fmtNumber4.format(y);
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
            if (currency) return fmtNumber2.format(num);
            if (pct) return `${fmtNumber2.format(num)} %`;
            return fmtNumber4.format(num);
          },
        },
      },
    },
  };

  const plugins: Plugin<"line">[] = [crosshairPlugin];
  if (pct && athValue !== null) plugins.push(athPlugin);

  return (
    <article className={className ? `panel ${className}` : "panel"}>
      <div className="panel-head">
        <h2>{title}</h2>
        <p className="muted panel-sub">{rangeLabel}</p>
      </div>
      {pct && athValue !== null && (
        <p className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
          ATH: <strong style={{ color: "#b86a00" }}>{fmtNumber2.format(athValue)} %</strong>
          {" "}· {athLabel}
        </p>
      )}
      <div className="chart-canvas-wrap">
        <Line data={chartData} options={options} plugins={plugins} />
      </div>
    </article>
  );
}
