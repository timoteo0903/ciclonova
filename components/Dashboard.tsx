"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { DashboardClassesData, DashboardData, Overview } from "@/lib/types";
import { formatPct, formatCurrency, formatNumber, toShortDate } from "@/lib/formatters";
import KpiCard from "./KpiCard";
import MetricList, { type MetricRow } from "./MetricList";
import CompositionPanel from "./CompositionPanel";

const LineChartPanel = dynamic(() => import("./LineChartPanel"), { ssr: false });

type Range = "30" | "90" | "180" | "all";
type StatusType = "loading" | "ok" | "error";

const RANGES: { label: string; value: Range }[] = [
  { label: "30D", value: "30" },
  { label: "90D", value: "90" },
  { label: "180D", value: "180" },
  { label: "Desde inicio", value: "all" },
];

const PAGES = ["Evolucion", "Metricas", "Composicion"] as const;

export default function Dashboard() {
  const [range, setRange] = useState<Range>("30");
  const [activePage, setActivePage] = useState(0);
  const [data, setData] = useState<DashboardClassesData | null>(null);
  const [status, setStatus] = useState<{ type: StatusType; text: string }>({
    type: "loading",
    text: "Consultando CAFCI y armando panel por clases...",
  });

  const loadDashboard = useCallback(async (r: Range) => {
    setStatus({ type: "loading", text: "Consultando CAFCI y armando panel por clases..." });
    try {
      const res = await fetch(`/api/fondo/dashboard?days=${encodeURIComponent(r)}`);
      const payload = await res.json();
      if (!res.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? "No se pudo cargar el dashboard.");
      }
      setData(payload.data as DashboardClassesData);
      const now = new Date().toLocaleString("es-AR");
      setStatus({ type: "ok", text: `Actualizado correctamente (${now}).` });
    } catch (e) {
      setStatus({
        type: "error",
        text: `Error al cargar datos: ${e instanceof Error ? e.message : "Error desconocido"}`,
      });
    }
  }, []);

  useEffect(() => {
    loadDashboard(range);
  }, [range, loadDashboard]);

  const classA = data?.classA ?? null;
  const classB = data?.classB ?? null;
  const combinedAum = data?.combinedAum ?? null;

  const classes = useMemo(
    () => [
      { key: "classA", label: "Clase A", dashboard: classA },
      { key: "classB", label: "Clase B", dashboard: classB },
    ],
    [classA, classB],
  );

  const classAOverview = classA?.overview ?? null;
  const classBOverview = classB?.overview ?? null;

  const classAPoints = classA?.evolution.points ?? [];
  const classBPoints = classB?.evolution.points ?? [];
  const totalAumPoints = combinedAum?.points ?? [];

  const classALabels = classAPoints.map((p) => toShortDate(p.date));
  const classBLabels = classBPoints.map((p) => toShortDate(p.date));
  const totalAumLabels = totalAumPoints.map((p) => toShortDate(p.date));

  const classAVcpSeries = classAPoints.map((p) => p.vcp);
  const classBVcpSeries = classBPoints.map((p) => p.vcp);
  const totalAumSeries = totalAumPoints.map((p) => p.aumTotal);

  const classARangeLabel = classA ? buildRangeLabel(classA) : "";
  const classBRangeLabel = classB ? buildRangeLabel(classB) : "";
  const totalAumRangeLabel = combinedAum
    ? `${toShortDate(combinedAum.window.startDate)} - ${toShortDate(combinedAum.window.endDate)} · ${combinedAum.window.points} observaciones`
    : "";

  return (
    <>
      <section className="hero fade-in">
        <div className="hero__left">
          <p className="eyebrow">Fondo Comun de Inversion</p>
          <h1>{classAOverview?.fund.alias ?? "Ciclo Nova"}</h1>
          <p className="muted hero-meta">
            {classAOverview
              ? `${classAOverview.fund.fundName} · ${classAOverview.fund.tipoFondo} · ${classAOverview.fund.tipoRenta}`
              : "Cargando datos..."}
          </p>
          <div className="source-row">
            <a
              href={classAOverview?.fund.sourceUrl ?? "https://www.cafci.org.ar/ficha-fondo.html?q=1717;5772"}
              target="_blank"
              rel="noreferrer"
              className="source-link"
            >
              Ver ficha Clase A
            </a>
            <a
              href={classBOverview?.fund.sourceUrl ?? "https://www.cafci.org.ar/ficha-fondo.html?q=1717;5773"}
              target="_blank"
              rel="noreferrer"
              className="source-link"
            >
              Ver ficha Clase B
            </a>
            {classAOverview?.asOfDate && <span className="muted">Datos al {classAOverview.asOfDate}</span>}
          </div>
        </div>

        <div className="hero__right">
          <p className="selector-title">Ventana de evolucion</p>
          <div className="range-selector">
            {RANGES.map((r) => (
              <button
                key={r.value}
                className={`range-btn${range === r.value ? " active" : ""}`}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <nav className="page-tabs">
        {PAGES.map((page, i) => (
          <button
            key={page}
            className={`page-tab${activePage === i ? " active" : ""}`}
            onClick={() => setActivePage(i)}
          >
            {page}
          </button>
        ))}
      </nav>

      {activePage === 0 && (
        <>
          <section className="kpi-grid fade-in stagger-1">
            <KpiCard
              label="AUM Clase A"
              value={classAOverview ? formatCurrency(classAOverview.current.aum) : "-"}
              sub={classAOverview?.fund.className ?? "Patrimonio bajo administracion"}
            />
            <KpiCard
              label="AUM Clase B"
              value={classBOverview ? formatCurrency(classBOverview.current.aum) : "-"}
              sub={classBOverview?.fund.className ?? "Patrimonio bajo administracion"}
            />
            <KpiCard
              label="AUM Total A+B"
              value={formatCurrency(combinedAum?.currentTotalAum)}
              sub="Suma de ambas clases"
            />
            <KpiCard
              label="VCP Clase A"
              value={classAOverview ? formatNumber(classAOverview.current.vcpUnitario, 4) : "-"}
              sub="Valor cuotaparte"
            />
            <KpiCard
              label="VCP Clase B"
              value={classBOverview ? formatNumber(classBOverview.current.vcpUnitario, 4) : "-"}
              sub="Valor cuotaparte"
            />
            <KpiCard
              label="Rendimiento Dia A"
              value={classAOverview ? formatPct(classAOverview.returns.day?.returnPct) : "-"}
              sub={classAOverview?.returns.day?.sinceDate ? `Desde ${classAOverview.returns.day.sinceDate}` : "-"}
              colorClass={returnColor(classAOverview?.returns.day?.returnPct)}
            />
            <KpiCard
              label="Rendimiento Dia B"
              value={classBOverview ? formatPct(classBOverview.returns.day?.returnPct) : "-"}
              sub={classBOverview?.returns.day?.sinceDate ? `Desde ${classBOverview.returns.day.sinceDate}` : "-"}
              colorClass={returnColor(classBOverview?.returns.day?.returnPct)}
            />
            <KpiCard
              label="Rendimiento Inicio A"
              value={classA?.inceptionStats ? formatPct(classA.inceptionStats.sinceInceptionReturnPct) : "..."}
              sub="Desde inicio de la clase"
              colorClass={returnColor(classA?.inceptionStats?.sinceInceptionReturnPct)}
            />
            <KpiCard
              label="Rendimiento Inicio B"
              value={classB?.inceptionStats ? formatPct(classB.inceptionStats.sinceInceptionReturnPct) : "..."}
              sub="Desde inicio de la clase"
              colorClass={returnColor(classB?.inceptionStats?.sinceInceptionReturnPct)}
            />
          </section>

          <section className="chart-grid fade-in stagger-2">
            <LineChartPanel
              title="Evolucion Valor Cuotaparte · Clase A"
              rangeLabel={classARangeLabel}
              labels={classALabels}
              data={classAVcpSeries}
              color="#5f2bd7"
              seriesLabel="VCP Clase A"
            />
            <LineChartPanel
              title="Evolucion Valor Cuotaparte · Clase B"
              rangeLabel={classBRangeLabel}
              labels={classBLabels}
              data={classBVcpSeries}
              color="#2146a6"
              seriesLabel="VCP Clase B"
            />
            <LineChartPanel
              className="panel-full-span"
              title="Evolucion AUM Total (Clase A + Clase B)"
              rangeLabel={totalAumRangeLabel}
              labels={totalAumLabels}
              data={totalAumSeries}
              color="#0f8f5d"
              seriesLabel="AUM Total"
              currency
            />
          </section>
        </>
      )}

      {activePage === 1 && (
        <section className="metrics-page fade-in">
          {classes.map((classItem) => {
            const derivedRows = buildDerivedRows(classItem.dashboard);
            const feeRows = buildFeeRows(classItem.dashboard?.overview ?? null);

            return (
              <article className="panel" key={classItem.key}>
                <h2>{classItem.label}</h2>
                <p className="muted panel-sub" style={{ marginBottom: 14 }}>
                  {classItem.dashboard?.overview.fund.className ?? "Cargando datos de clase..."}
                </p>

                <p className="section-label">Metricas derivadas</p>
                {derivedRows.length > 0 ? (
                  <MetricList rows={derivedRows} />
                ) : (
                  <p className="muted" style={{ marginTop: 14 }}>Cargando...</p>
                )}

                <p className="section-label section-label--spaced">Honorarios y comisiones</p>
                {feeRows.length > 0 ? (
                  <MetricList rows={feeRows} />
                ) : (
                  <p className="muted" style={{ marginTop: 14 }}>Cargando...</p>
                )}
              </article>
            );
          })}
        </section>
      )}

      {activePage === 2 && (
        <section className="composition-classes fade-in" style={{ marginTop: 20 }}>
          {classes.map((classItem) => (
            <div key={classItem.key}>
              <div className="class-strip">
                <h2>{classItem.label}</h2>
                <p className="muted panel-sub">
                  {classItem.dashboard?.overview.fund.className ?? "Cargando composicion..."}
                </p>
              </div>
              {classItem.dashboard ? (
                <CompositionPanel
                  holdings={classItem.dashboard.overview.portfolio.holdings}
                  asOfDate={classItem.dashboard.overview.portfolio.asOfDate}
                />
              ) : (
                <article className="panel">
                  <p className="muted">Cargando datos de composicion...</p>
                </article>
              )}
            </div>
          ))}
        </section>
      )}

      <div className={`status status--${status.type}`}>{status.text}</div>
    </>
  );
}

function returnColor(val: number | null | undefined): "positive" | "negative" | "neutral" {
  if (val == null) return "neutral";
  return val > 0 ? "positive" : val < 0 ? "negative" : "neutral";
}

function buildRangeLabel(dashboard: DashboardData): string {
  return `${toShortDate(dashboard.evolution.window.startDate)} - ${toShortDate(dashboard.evolution.window.endDate)} · ${dashboard.evolution.window.points} observaciones`;
}

function buildFeeRows(overview: Overview | null): MetricRow[] {
  if (!overview) return [];

  return [
    { name: "Inversion minima", value: formatCurrency(overview.fund.inversionMinima) },
    { name: "Honorario gerente", value: formatPct(overview.fees.adminGerentePct, 4) },
    { name: "Honorario depositaria", value: formatPct(overview.fees.adminDepositariaPct, 4) },
    { name: "Comision ingreso", value: formatPct(overview.fees.comisionIngresoPct, 4) },
    { name: "Comision rescate", value: formatPct(overview.fees.comisionRescatePct, 4) },
    { name: "Comision transferencia", value: formatPct(overview.fees.comisionTransferenciaPct, 4) },
  ];
}

function buildDerivedRows(dashboard: DashboardData | null): MetricRow[] {
  if (!dashboard) return [];

  const stats = dashboard.evolution.stats;
  return [
    {
      name: "Retorno desde inicio",
      value: formatPct(stats.sinceInceptionReturnPct),
      rawValue: stats.sinceInceptionReturnPct,
    },
    {
      name: "Cambio AUM desde inicio",
      value: formatPct(stats.aumChangePct),
      rawValue: stats.aumChangePct,
    },
    {
      name: "Max drawdown",
      value: formatPct(stats.maxDrawdownPct),
      rawValue: stats.maxDrawdownPct,
    },
    {
      name: "Volatilidad anualizada (30d)",
      value: formatPct(stats.annualizedVolatilityPct30d),
      rawValue: stats.annualizedVolatilityPct30d,
    },
    { name: "Puntos en serie", value: formatNumber(stats.points, 0) },
    {
      name: "Ventana analizada",
      value: `${toShortDate(dashboard.evolution.window.startDate)} -> ${toShortDate(dashboard.evolution.window.endDate)}`,
    },
  ];
}
