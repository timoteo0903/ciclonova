"use client";

import { useEffect, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import type { DashboardStatsData } from "@/app/api/fondos/dashboard-stats/route";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

// ─── Helpers de formato ───────────────────────────────────────────────────────

function fmtMillions(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)} MM`;
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)} M`;
  return val.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtMillionsLabel(val: number, prefix = "$"): string {
  return `${prefix} ${fmtMillions(val)}`;
}

// ─── Formato de fechas ────────────────────────────────────────────────────────

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtDateShort(iso: string): string {
  // iso = "YYYY-MM-DD"
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  const day = Number(parts[2]);
  const mon = MESES[Number(parts[1]) - 1] ?? "";
  return `${day} ${mon}`;
}

// ─── Opciones comunes ─────────────────────────────────────────────────────────

function barOptions(prefix = "$") {
  return {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item: { raw: unknown }) => ` ${fmtMillionsLabel(item.raw as number, prefix)}`,
        },
      },
    },
    scales: {
      x: {
        min: 0,
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: {
          font: { size: 11 },
          callback: (val: number | string) => fmtMillions(Number(val)),
        },
      },
      y: {
        grid: { display: false },
        ticks: { font: { size: 12, weight: "bold" as const } },
      },
    },
  };
}

function lineOptions(prefix = "$", fullDates: string[], showLegend = false, showTotal = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    plugins: {
      legend: {
        display: showLegend,
        position: "top" as const,
        labels: { boxWidth: 12, font: { size: 11 } },
      },
      tooltip: {
        callbacks: {
          title: (items: { dataIndex: number }[]) => {
            const iso = fullDates[items[0]?.dataIndex ?? 0];
            return iso ? fmtDateShort(iso) : "";
          },
          label: (item: { dataset: { label?: string }; raw: unknown }) =>
            ` ${item.dataset.label ? item.dataset.label + ": " : ""}${fmtMillionsLabel(item.raw as number, prefix)}`,
          ...(showTotal && {
            afterBody: (items: { raw: unknown }[]) => {
              const total = items.reduce((s, i) => s + ((i.raw as number) ?? 0), 0);
              return [`  Total: ${fmtMillionsLabel(total, prefix)}`];
            },
          }),
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 10 },
          maxTicksLimit: 8,
          maxRotation: 0,
          autoSkip: true,
          callback: (_val: number | string, index: number) => fmtDateShort(fullDates[index] ?? ""),
        },
      },
      y: {
        min: 0,
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: {
          font: { size: 11 },
          callback: (val: number | string) => fmtMillions(Number(val)),
        },
      },
    },
  };
}

// ─── Paletas ──────────────────────────────────────────────────────────────────

const VIOLET = "#5f2bd7";
const VIOLET_SOFT = "rgba(95,43,215,0.12)";
const ORANGE = "#e07b00";
const ORANGE_SOFT = "rgba(224,123,0,0.12)";
const GREEN = "#0f8f5d";
const GREEN_SOFT = "rgba(15,143,93,0.12)";

const BAR_COLORS_ARS = [
  "#5f2bd7", "#7c3aed", "#9d5cf5", "#b57bf7", "#c99bf9",
  "#dbbcfb", "#e8d4fd",
];
const BAR_COLORS_USD = [
  "#e07b00", "#c2410c", "#f97316", "#fb923c", "#fdba74",
  "#0369a1", "#0f8f5d",
];


// ─── Componente principal ─────────────────────────────────────────────────────

export default function MetricasDashboard() {
  const [data, setData] = useState<DashboardStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/fondos/dashboard-stats")
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        if (!payload.success) throw new Error(payload.error ?? "Error");
        setData(payload.data as DashboardStatsData);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="metricas-loading">
        <div className="metricas-spinner" />
        <span>Cargando datos del dashboard...</span>
      </div>
    );
  }
  if (error) {
    return <p className="status status--error" style={{ marginTop: 16 }}>Error: {error}</p>;
  }
  if (!data) return null;

  // ── Bar charts ──────────────────────────────────────────────────────────────

  const barDataArs = {
    labels: data.aumByFundArs.map((f) => f.fundName),
    datasets: [{
      data: data.aumByFundArs.map((f) => f.aum),
      backgroundColor: data.aumByFundArs.map((_, i) => BAR_COLORS_ARS[i % BAR_COLORS_ARS.length]),
      borderRadius: 6,
      borderSkipped: false,
    }],
  };

  const barDataUsd = {
    labels: data.aumByFundUsd.map((f) => f.fundName),
    datasets: [{
      data: data.aumByFundUsd.map((f) => f.aum),
      backgroundColor: data.aumByFundUsd.map((_, i) => BAR_COLORS_USD[i % BAR_COLORS_USD.length]),
      borderRadius: 6,
      borderSkipped: false,
    }],
  };

  // ── Line charts ─────────────────────────────────────────────────────────────

  const datesArs = data.aumHistoryArs.map((p) => p.date);
  const datesUsd = data.aumHistoryUsd.map((p) => p.date);
  const datesPesificado = data.aumHistoryPesificado.map((p) => p.date);

  const lineDataArs = {
    labels: datesArs,
    datasets: [{
      data: data.aumHistoryArs.map((p) => p.total),
      borderColor: VIOLET,
      backgroundColor: VIOLET_SOFT,
      fill: true,
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2,
    }],
  };

  const lineDataUsd = {
    labels: datesUsd,
    datasets: [{
      data: data.aumHistoryUsd.map((p) => p.total),
      borderColor: ORANGE,
      backgroundColor: ORANGE_SOFT,
      fill: true,
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2,
    }],
  };

  // ── Combined total chart (ARS pesificado + USD) ──────────────────────────────
  // Merge dates from both series into a single sorted array
  const allTotalDates = Array.from(
    new Set([...datesPesificado, ...datesUsd]),
  ).sort();

  const pesificadoByDate = new Map(data.aumHistoryPesificado.map((p) => [p.date, p.total]));
  const usdByDate = new Map(data.aumHistoryUsd.map((p) => [p.date, p.total]));

  const lineDataTotal = {
    labels: allTotalDates,
    datasets: [
      {
        label: "Fondos ARS (Dolarizados)",
        data: allTotalDates.map((d) => pesificadoByDate.get(d) ?? null),
        borderColor: GREEN,
        backgroundColor: GREEN_SOFT,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: "Fondos USD",
        data: allTotalDates.map((d) => usdByDate.get(d) ?? null),
        borderColor: ORANGE,
        backgroundColor: ORANGE_SOFT,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  };

  const barHeightArs = Math.max(200, data.aumByFundArs.length * 44);
  const barHeightUsd = Math.max(200, data.aumByFundUsd.length * 44);

  // ── KPIs ──────────────────────────────────────────────────────────────────────
  const kpiArs = data.aumByFundArs.reduce((s, f) => s + f.aum, 0);
  const kpiUsd = data.aumByFundUsd.reduce((s, f) => s + f.aum, 0);
  const kpiTotal = data.dolarOficial ? kpiArs / data.dolarOficial + kpiUsd : null;

  return (
    <>
    {/* ── KPI bar ── */}
    <div className="md-kpis">
      <div className="md-kpi">
        <span className="md-kpi-label">AUM Total</span>
        <span className="md-kpi-value">
          {kpiTotal != null ? `U$D ${fmtMillions(kpiTotal)}` : "—"}
        </span>
        <span className="md-kpi-sub">Fondos ARS + USD en dólares</span>
      </div>
      <div className="md-kpi">
        <span className="md-kpi-label">AUM Fondos en Pesos</span>
        <span className="md-kpi-value md-kpi-value--ars">
          $ {fmtMillions(kpiArs)}
        </span>
      </div>
      <div className="md-kpi">
        <span className="md-kpi-label">AUM Fondos en Dólares</span>
        <span className="md-kpi-value md-kpi-value--usd">
          U$D {fmtMillions(kpiUsd)}
        </span>
      </div>
    </div>

    <div className="md-grid">
      {/* ── Bar ARS ── */}
      <div className="mc-card">
        <div className="mc-card-head">
          <div className="mc-card-head-left">
            <span className="mc-card-icon">🏦</span>
            <div>
              <p className="mc-card-title">AUM por Fondo</p>
              <p className="mc-card-sub">Fondos en Pesos · último dato disponible</p>
            </div>
          </div>
          <span className="mc-currency-chip">🇦🇷 ARS</span>
        </div>
        <div style={{ padding: "20px 20px 16px", height: barHeightArs }}>
          {data.aumByFundArs.length > 0
            ? <Bar data={barDataArs} options={barOptions("$")} />
            : <p className="mc-empty">Sin datos</p>}
        </div>
      </div>

      {/* ── Bar USD ── */}
      <div className="mc-card">
        <div className="mc-card-head">
          <div className="mc-card-head-left">
            <span className="mc-card-icon">🏦</span>
            <div>
              <p className="mc-card-title">AUM por Fondo</p>
              <p className="mc-card-sub">Fondos en Dólares · último dato disponible</p>
            </div>
          </div>
          <span className="mc-currency-chip">🇺🇸 USD</span>
        </div>
        <div style={{ padding: "20px 20px 16px", height: barHeightUsd }}>
          {data.aumByFundUsd.length > 0
            ? <Bar data={barDataUsd} options={barOptions("U$D")} />
            : <p className="mc-empty">Sin datos</p>}
        </div>
      </div>

      {/* ── Line AUM ARS ── */}
      <div className="mc-card">
        <div className="mc-card-head">
          <div className="mc-card-head-left">
            <span className="mc-card-icon">📈</span>
            <div>
              <p className="mc-card-title">Evolución AUM Total</p>
              <p className="mc-card-sub">Fondos en Pesos · últimos 90 días</p>
            </div>
          </div>
          <span className="mc-currency-chip">🇦🇷 ARS</span>
        </div>
        <div style={{ padding: "16px 20px 20px", height: 220 }}>
          {data.aumHistoryArs.length > 0
            ? <Line data={lineDataArs} options={lineOptions("$", datesArs)} />
            : <p className="mc-empty">Sin datos históricos</p>}
        </div>
      </div>

      {/* ── Line AUM USD ── */}
      <div className="mc-card">
        <div className="mc-card-head">
          <div className="mc-card-head-left">
            <span className="mc-card-icon">📈</span>
            <div>
              <p className="mc-card-title">Evolución AUM Total</p>
              <p className="mc-card-sub">Fondos en Dólares · últimos 90 días</p>
            </div>
          </div>
          <span className="mc-currency-chip">🇺🇸 USD</span>
        </div>
        <div style={{ padding: "16px 20px 20px", height: 220 }}>
          {data.aumHistoryUsd.length > 0
            ? <Line data={lineDataUsd} options={lineOptions("U$D", datesUsd)} />
            : <p className="mc-empty">Sin datos históricos</p>}
        </div>
      </div>

      {/* ── Line AUM Total en USD (pesificado + USD) ── */}
      <div className="mc-card md-card--full">
        <div className="mc-card-head">
          <div className="mc-card-head-left">
            <span className="mc-card-icon">💱</span>
            <div>
              <p className="mc-card-title">AUM Total en USD</p>
              <p className="mc-card-sub">
                Fondos ARS pesificados + Fondos USD · últimos 90 días
                {data.dolarOficial != null && (
                  <> · <strong>TC: ${data.dolarOficial.toLocaleString("es-AR")}</strong></>
                )}
              </p>
            </div>
          </div>
          <span className="mc-currency-chip">💵 USD</span>
        </div>
        <div style={{ padding: "16px 20px 20px", height: 240 }}>
          {allTotalDates.length > 0
            ? <Line data={lineDataTotal} options={lineOptions("U$D", allTotalDates, true, true)} />
            : <p className="mc-empty">
                {data.dolarOficial == null
                  ? "No se pudo obtener el tipo de cambio"
                  : "Sin datos históricos"}
              </p>}
        </div>
      </div>
    </div>
    </>
  );
}
