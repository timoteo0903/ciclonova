"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type {
  MultiFundDashboard,
  MultiFundClassData,
  Overview,
  BenchmarkData,
} from "@/lib/types";
import { formatPct, formatCurrency, formatNumber, toShortDate } from "@/lib/formatters";
import KpiCard from "./KpiCard";
import MetricList, { type MetricRow } from "./MetricList";
import CompositionPanel from "./CompositionPanel";
import VcpReferenceTable from "./VcpReferenceTable";
import MetricasPanel from "./MetricasPanel";
import { ALL_FUNDS } from "@/lib/funds-config";

const LineChartPanel = dynamic(() => import("./LineChartPanel"), { ssr: false });
const BenchmarkPanel = dynamic(() => import("./BenchmarkPanel"), { ssr: false });

// Caché client-side a nivel módulo: sobrevive re-renders y navegaciones dentro de la app
const TTL_MS = 5 * 60 * 1000; // 5 minutos
const dashboardCache = new Map<string, { data: MultiFundDashboard; expiresAt: number }>();
const benchmarkCache = new Map<string, { data: BenchmarkData; expiresAt: number }>();

type Range = "30" | "90" | "180" | "all";
type StatusType = "loading" | "ok" | "error";
type PageType = "Evolucion" | "Composicion" | "Benchmark" | "Métricas";

const RANGES: { label: string; value: Range }[] = [
  { label: "30D", value: "30" },
  { label: "90D", value: "90" },
  { label: "180D", value: "180" },
  { label: "Desde inicio", value: "all" },
];

const PAGES: PageType[] = ["Evolucion", "Composicion", "Benchmark", "Métricas"];

const DEFAULT_FUND_ID = 1717; // Ciclo Nova (IEB Estratégico II)

export default function Dashboard() {
  const [selectedFundId, setSelectedFundId] = useState<number>(DEFAULT_FUND_ID);
  const [range, setRange] = useState<Range>("30");
  const [activePage, setActivePage] = useState(0);
  const [data, setData] = useState<MultiFundDashboard | null>(null);
  const [status, setStatus] = useState<{ type: StatusType; text: string }>({
    type: "loading",
    text: "Cargando datos del fondo...",
  });

  // Buscador de fondos
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Benchmark state
  const [benchmarkFundIds, setBenchmarkFundIds] = useState<number[]>([DEFAULT_FUND_ID]);
  const [benchmarkRange, setBenchmarkRange] = useState<Range>("180");
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData | null>(null);
  const [benchmarkStatus, setBenchmarkStatus] = useState<StatusType>("loading");

  // Resumen IA state
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadDashboard = useCallback(async (fundId: number, r: Range) => {
    const cacheKey = `${fundId}:${r}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      setData(cached.data);
      setStatus({ type: "ok", text: `Actualizado (${new Date(cached.expiresAt - TTL_MS).toLocaleString("es-AR")}).` });
      return;
    }
    setStatus({ type: "loading", text: "Cargando datos del fondo..." });
    try {
      const res = await fetch(`/api/fondos/${fundId}/dashboard?days=${encodeURIComponent(r)}`);
      const payload = await res.json();
      if (!res.ok || !payload.success || !payload.data) {
        throw new Error(payload.error ?? "No se pudo cargar el fondo.");
      }
      const dashData = payload.data as MultiFundDashboard;
      dashboardCache.set(cacheKey, { data: dashData, expiresAt: Date.now() + TTL_MS });
      setData(dashData);
      setStatus({ type: "ok", text: `Actualizado (${new Date().toLocaleString("es-AR")}).` });
    } catch (e) {
      setStatus({
        type: "error",
        text: `Error: ${e instanceof Error ? e.message : "Error desconocido"}`,
      });
    }
  }, []);

  const loadBenchmark = useCallback(async (fundIds: number[], r: Range) => {
    if (fundIds.length === 0) return;
    const cacheKey = `${fundIds.join(",")}:${r}`;
    const cached = benchmarkCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      setBenchmarkData(cached.data);
      setBenchmarkStatus("ok");
      return;
    }
    setBenchmarkStatus("loading");
    try {
      const res = await fetch(
        `/api/fondos/benchmark?funds=${fundIds.join(",")}&days=${encodeURIComponent(r)}`,
      );
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.error ?? "Error en benchmark");
      const bmData = payload.data as BenchmarkData;
      benchmarkCache.set(cacheKey, { data: bmData, expiresAt: Date.now() + TTL_MS });
      setBenchmarkData(bmData);
      setBenchmarkStatus("ok");
    } catch {
      setBenchmarkStatus("error");
    }
  }, []);

  useEffect(() => {
    loadDashboard(selectedFundId, range);
  }, [selectedFundId, range, loadDashboard]);

  useEffect(() => {
    if (activePage === 2) {
      loadBenchmark(benchmarkFundIds, benchmarkRange);
    }
  }, [activePage, benchmarkFundIds, benchmarkRange, loadBenchmark]);

  // Config del fondo seleccionado
  const selectedFundConfig = useMemo(
    () => ALL_FUNDS.find((f) => f.fundId === selectedFundId),
    [selectedFundId],
  );

  // Clases activas (con datos)
  const activeClasses = useMemo(
    () =>
      (data?.classes ?? []).filter(
        (cls) =>
          cls.overview.current.vcpUnitario !== null || cls.evolution.points.length > 0,
      ),
    [data],
  );

  // Clase principal (primera activa)
  const primaryClass: MultiFundClassData | null = activeClasses[0] ?? null;
  const primaryOverview: Overview | null = primaryClass?.overview ?? null;

  // Moneda: normaliza acentos para manejar "Dolar"/"Dólar"/"Dólares" del API
  const monedaRaw = primaryOverview?.fund.moneda ?? "";
  const monedaNorm = monedaRaw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const currency: "ARS" | "USD" | null =
    monedaNorm.includes("dolar") || monedaNorm.includes("dollar") || monedaNorm.includes("usd")
      ? "USD"
      : monedaNorm.includes("peso") || monedaNorm.includes("ars")
        ? "ARS"
        : (selectedFundConfig?.moneda ?? null);

  // Fecha desde inicio (primer dato en BD)
  const inceptionDateStr = primaryClass?.inceptionStartDate
    ? toShortDate(primaryClass.inceptionStartDate)
    : null;

  // Puntos para gráficos
  const primaryPoints = primaryClass?.evolution.points ?? [];
  const aumPoints = data?.aumHistoryPoints ?? [];

  // Resumen IA
  const fetchSummary = async () => {
    if (!primaryClass) return;
    setSummaryOpen(true);
    setSummaryLoading(true);
    setSummaryText("");
    try {
      const pts = primaryClass.evolution.points;
      const firstPt = pts.find((p) => p.vcp !== null);
      const lastPt = [...pts].reverse().find((p) => p.vcp !== null);
      const firstAumPt = aumPoints.find((p) => p.aumTotal !== null);
      const lastAumPt = [...aumPoints].reverse().find((p) => p.aumTotal !== null);
      const res = await fetch("/api/fondos/resumen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fundName: selectedFundConfig?.fundName ?? "Fondo",
          period: range,
          vcpInicio: firstPt?.vcp ?? null,
          vcpFin: lastPt?.vcp ?? null,
          returnPct: primaryClass.evolution.stats.sinceInceptionReturnPct,
          aumInicio: firstAumPt?.aumTotal ?? null,
          aumFin: lastAumPt?.aumTotal ?? null,
          aumChangePct: primaryClass.evolution.stats.aumChangePct,
          maxDrawdown: primaryClass.evolution.stats.maxDrawdownPct,
          volatility: primaryClass.evolution.stats.annualizedVolatilityPct30d,
          points: primaryClass.evolution.stats.points,
          dateInicio: primaryClass.evolution.window.startDate,
          dateFin: primaryClass.evolution.window.endDate,
        }),
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.error ?? "Error");
      setSummaryText(payload.summary);
    } catch (e) {
      setSummaryText(`Error al generar el resumen: ${e instanceof Error ? e.message : "Error desconocido"}`);
    } finally {
      setSummaryLoading(false);
    }
  };

  const primaryLabels = primaryPoints.map((p) => toShortDate(p.date));
  const aumLabels = aumPoints.map((p) => toShortDate(p.date));

  const vcpSeries = primaryPoints.map((p) => p.vcp);
  const aumSeries = aumPoints.map((p) => p.aumTotal);

  const firstVcp = primaryPoints.find((p) => p.vcp !== null)?.vcp ?? null;
  const returnSeries = primaryPoints.map((p) =>
    firstVcp && p.vcp !== null ? Number(((p.vcp / firstVcp - 1) * 100).toFixed(4)) : null,
  );

  const rangeLabel = primaryClass
    ? `${toShortDate(primaryClass.evolution.window.startDate)} - ${toShortDate(primaryClass.evolution.window.endDate)} · ${primaryClass.evolution.window.points} obs.`
    : "";
  const aumRangeLabel =
    aumPoints.length > 0
      ? `${toShortDate(aumPoints[0].date)} - ${toShortDate(aumPoints[aumPoints.length - 1].date)} · ${aumPoints.length} obs.`
      : "";

  // AUM por clase activa (para breakdown)
  const aumByClass = useMemo(
    () =>
      activeClasses.map((c) => ({
        classId: c.classId,
        className: c.className,
        aum: c.overview.current.aum,
      })),
    [activeClasses],
  );

  const totalAum = data?.totalAumNow ?? null;

  // Fondos filtrados por búsqueda
  const filteredFunds = useMemo(
    () =>
      search.trim()
        ? ALL_FUNDS.filter(
            (f) =>
              f.fundName.toLowerCase().includes(search.toLowerCase()) ||
              f.originalName.toLowerCase().includes(search.toLowerCase()),
          )
        : ALL_FUNDS,
    [search],
  );

  return (
    <>
      {/* ── Loading modal ───────────────────────────────────────────────────── */}
      {status.type === "loading" && (
        <div className="loading-overlay">
          <div className="loading-card">
            <div className="loading-spinner" />
            <p className="loading-text">Cargando datos del fondo...</p>
          </div>
        </div>
      )}

      {/* ── Summary modal ───────────────────────────────────────────────────── */}
      {summaryOpen && (
        <div className="loading-overlay" onClick={() => setSummaryOpen(false)}>
          <div className="summary-card" onClick={(e) => e.stopPropagation()}>
            <div className="summary-card-header">
              <p className="summary-card-title">
                Análisis IA · {selectedFundConfig?.fundName} · {range === "all" ? "Desde inicio" : `${range}D`}
              </p>
              <button className="summary-close" onClick={() => setSummaryOpen(false)}>✕</button>
            </div>
            {summaryLoading ? (
              <div className="summary-loading">
                <div className="loading-spinner" />
                <span>Generando análisis...</span>
              </div>
            ) : (
              <p className="summary-body">{summaryText}</p>
            )}
            <p className="summary-footer">Generado por Claude AI · Solo referencial</p>
          </div>
        </div>
      )}

      {/* ── Hero (oculto en Métricas) ────────────────────────────────────────── */}
      {activePage === 3 && (
        <p className="eyebrow" style={{ marginBottom: 4 }}>IEB S.A. · Fondos Comunes de Inversión</p>
      )}
      <section className={`hero fade-in${activePage === 3 ? " hero--hidden" : ""}`}>

        {/* ── Columna izquierda: info del fondo ── */}
        <div className="hero__left">
          <p className="eyebrow">IEB S.A. · Fondos Comunes de Inversión</p>

          <h1 className="hero-fund-title">{selectedFundConfig?.fundName ?? "Fondo"}</h1>

          {/* Nombre real + badge de moneda en la misma fila */}
          <div className="hero-subtitle-row">
            {selectedFundConfig?.originalName &&
              selectedFundConfig.originalName !== selectedFundConfig.fundName && (
                <span className="hero-real-name">{selectedFundConfig.originalName}</span>
              )}
            {currency && (
              <span className={`currency-badge currency-badge--${currency === "USD" ? "usd" : "ars"}`}>
                {currency === "USD" ? "🇺🇸" : "🇦🇷"}
                <span>{currency === "USD" ? "Dólares" : "Pesos Arg."}</span>
              </span>
            )}
          </div>

          <p className="muted hero-meta">
            {primaryOverview
              ? `${primaryOverview.fund.tipoFondo} · ${primaryOverview.fund.tipoRenta} · ${primaryOverview.fund.moneda}`
              : "Cargando datos..."}
          </p>

          <div className="source-row">
            {activeClasses.slice(0, 3).map((cls) => (
              <a
                key={cls.classId}
                href={cls.overview.fund.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="source-link"
              >
                Ver ficha {cls.className}
              </a>
            ))}
            {primaryOverview?.asOfDate && (
              <span className="muted">Datos al {primaryOverview.asOfDate}</span>
            )}
          </div>
        </div>

        {/* ── Columna derecha: controles ── */}
        <div className="hero__right">
          {/* Buscador de fondo */}
          <p className="selector-title">Cambiar fondo</p>
          <div className="fund-search-wrap" ref={dropdownRef}>
            <input
              className="fund-search-input"
              value={dropdownOpen ? search : (selectedFundConfig?.fundName ?? "")}
              onChange={(e) => { setSearch(e.target.value); setDropdownOpen(true); }}
              onFocus={() => { setSearch(""); setDropdownOpen(true); }}
              placeholder="Buscar fondo..."
              autoComplete="off"
            />
            <svg className="fund-search-icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zm-5.242 1.656a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z"/>
            </svg>
            {dropdownOpen && (
              <div className="fund-search-dropdown">
                {filteredFunds.length === 0 && (
                  <p className="fund-search-empty">Sin resultados</p>
                )}
                {filteredFunds.map((f) => (
                  <button
                    key={f.fundId}
                    className={`fund-search-option${f.fundId === selectedFundId ? " selected" : ""}`}
                    onClick={() => {
                      setSelectedFundId(f.fundId);
                      setDropdownOpen(false);
                      setSearch("");
                      setActivePage(0);
                    }}
                  >
                    <span className="fso-commercial">{f.fundName}</span>
                    <span className="fso-original">{f.originalName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="hero-right-divider" />

          {/* Ventana de evolución */}
          <p className="selector-title">Ventana de evolución</p>
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

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
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

      {/* ── Evolucion ───────────────────────────────────────────────────────── */}
      {activePage === 0 && (
        <>
          <section className="kpi-grid fade-in stagger-1">
            <KpiCard
              label={`AUM Total · ${activeClasses.length} clase${activeClasses.length !== 1 ? "s" : ""}`}
              value={formatCurrency(totalAum)}
              sub="Patrimonio bajo administración"
            />
            <KpiCard
              label="VCP"
              value={primaryOverview ? formatNumber(primaryOverview.current.vcpUnitario, 4) : "-"}
              sub="Valor cuotaparte"
            />
            <KpiCard
              label="Rendimiento Diario"
              value={primaryOverview ? formatPct(primaryOverview.returns.day?.returnPct) : "-"}
              sub={
                primaryOverview?.returns.day?.sinceDate
                  ? `Desde ${primaryOverview.returns.day.sinceDate}`
                  : "-"
              }
              colorClass={returnColor(primaryOverview?.returns.day?.returnPct)}
            />
            <KpiCard
              label="Rendimiento Desde Inicio"
              value={
                primaryClass?.inceptionStats
                  ? formatPct(primaryClass.inceptionStats.sinceInceptionReturnPct)
                  : "..."
              }
              sub={
                inceptionDateStr
                  ? `Clase A · desde ${inceptionDateStr} (primer dato en BD)`
                  : "Clase A · desde primer dato disponible"
              }
              colorClass={returnColor(primaryClass?.inceptionStats?.sinceInceptionReturnPct)}
            />
          </section>

          {/* AUM breakdown por clase (solo si hay más de una activa) */}
          {aumByClass.length > 1 && (
            <section className="aum-breakdown fade-in stagger-2">
              <p className="section-label" style={{ marginBottom: 8 }}>
                Distribución AUM por clase
              </p>
              <div className="aum-breakdown__bars">
                {aumByClass.map((cls) => {
                  const pct = totalAum && cls.aum ? (cls.aum / totalAum) * 100 : 0;
                  return (
                    <div className="aum-bar-row" key={cls.classId}>
                      <span className="aum-bar-label">{cls.className}</span>
                      <div className="aum-bar-track">
                        <div className="aum-bar-fill" style={{ width: `${pct.toFixed(1)}%` }} />
                      </div>
                      <span className="aum-bar-value">{formatCurrency(cls.aum)}</span>
                      <span className="aum-bar-pct">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="chart-grid fade-in stagger-2">
            <LineChartPanel
              title="Evolución Valor Cuotaparte (Clase A)"
              rangeLabel={rangeLabel}
              labels={primaryLabels}
              data={vcpSeries}
              color="#5f2bd7"
              seriesLabel="VCP"
            />
            <LineChartPanel
              title="Rendimiento acumulado (Clase A)"
              rangeLabel={rangeLabel}
              labels={primaryLabels}
              data={returnSeries}
              color="#e07b00"
              seriesLabel="Rendimiento %"
              pct
            />
            <LineChartPanel
              title={`Evolución AUM Total (${activeClasses.length} clase${activeClasses.length !== 1 ? "s" : ""})`}
              rangeLabel={aumRangeLabel}
              labels={aumLabels}
              data={aumSeries}
              color="#0f8f5d"
              seriesLabel="AUM Total"
              currency
            />
          </section>

          <section className="fade-in stagger-3" style={{ marginTop: 16 }}>
            <VcpReferenceTable
              label="Clase A"
              overview={primaryOverview}
              inceptionStats={primaryClass?.inceptionStats ?? null}
            />
          </section>


        </>
      )}

      {/* ── Composicion ─────────────────────────────────────────────────────── */}
      {activePage === 1 && (
        <section className="composition-classes fade-in" style={{ marginTop: 20 }}>
          {activeClasses.slice(0, 2).map((cls) => (
            <div key={cls.classId}>
              <div className="class-strip">
                <h2>{cls.className}</h2>
                <p className="muted panel-sub">{cls.overview.fund.className}</p>
              </div>
              <CompositionPanel
                holdings={cls.overview.portfolio.holdings}
                asOfDate={cls.overview.portfolio.asOfDate}
              />
            </div>
          ))}
        </section>
      )}

      {/* ── Benchmark ───────────────────────────────────────────────────────── */}
      {activePage === 2 && (
        <section className="benchmark-page fade-in" style={{ marginTop: 20 }}>
          <div className="benchmark-controls">
            <div className="benchmark-controls__left">
              <p className="selector-title" style={{ textAlign: "left", marginBottom: 10 }}>
                Fondos a comparar (Clase A de cada uno)
              </p>
              <div className="fund-checkbox-grid">
                {ALL_FUNDS.map((f) => (
                  <label key={f.fundId} className="fund-checkbox-label">
                    <input
                      type="checkbox"
                      checked={benchmarkFundIds.includes(f.fundId)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBenchmarkFundIds((prev) => [...prev, f.fundId]);
                        } else {
                          setBenchmarkFundIds((prev) => prev.filter((id) => id !== f.fundId));
                        }
                      }}
                    />
                    <span>{f.fundName}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="benchmark-controls__right">
              <p className="selector-title" style={{ textAlign: "right" }}>
                Ventana
              </p>
              <div className="range-selector" style={{ justifyContent: "flex-end" }}>
                {RANGES.map((r) => (
                  <button
                    key={r.value}
                    className={`range-btn${benchmarkRange === r.value ? " active" : ""}`}
                    onClick={() => setBenchmarkRange(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button
                className="range-btn"
                style={{ marginTop: 10 }}
                onClick={() => loadBenchmark(benchmarkFundIds, benchmarkRange)}
              >
                Actualizar
              </button>
            </div>
          </div>

          {benchmarkStatus === "loading" && (
            <p className="muted" style={{ marginTop: 20 }}>
              Cargando benchmark...
            </p>
          )}
          {benchmarkStatus === "error" && (
            <p className="status status--error" style={{ marginTop: 20 }}>
              Error al cargar el benchmark.
            </p>
          )}
          {benchmarkStatus === "ok" && benchmarkData && (
            <BenchmarkPanel data={benchmarkData} />
          )}
        </section>
      )}

      {/* ── Métricas ────────────────────────────────────────────────────────── */}
      {activePage === 3 && <MetricasPanel />}

      <div className={`status status--${status.type}`}>{status.text}</div>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function returnColor(val: number | null | undefined): "positive" | "negative" | "neutral" {
  if (val == null) return "neutral";
  return val > 0 ? "positive" : val < 0 ? "negative" : "neutral";
}

function buildFeeRows(overview: Overview): MetricRow[] {
  return [
    { name: "Inversión mínima", value: formatCurrency(overview.fund.inversionMinima) },
    { name: "Honorario gerente", value: formatPct(overview.fees.adminGerentePct, 4) },
    { name: "Honorario depositaria", value: formatPct(overview.fees.adminDepositariaPct, 4) },
    { name: "Comisión ingreso", value: formatPct(overview.fees.comisionIngresoPct, 4) },
    { name: "Comisión rescate", value: formatPct(overview.fees.comisionRescatePct, 4) },
    { name: "Comisión transferencia", value: formatPct(overview.fees.comisionTransferenciaPct, 4) },
  ];
}

function buildDerivedRows(cls: MultiFundClassData): MetricRow[] {
  const stats = cls.evolution.stats;
  return [
    { name: "Retorno desde inicio", value: formatPct(stats.sinceInceptionReturnPct), rawValue: stats.sinceInceptionReturnPct },
    { name: "Cambio AUM desde inicio", value: formatPct(stats.aumChangePct), rawValue: stats.aumChangePct },
    { name: "Max drawdown", value: formatPct(stats.maxDrawdownPct), rawValue: stats.maxDrawdownPct },
    { name: "Volatilidad anualizada (30d)", value: formatPct(stats.annualizedVolatilityPct30d), rawValue: stats.annualizedVolatilityPct30d },
    { name: "Puntos en serie", value: formatNumber(stats.points, 0) },
    { name: "Ventana analizada", value: `${toShortDate(cls.evolution.window.startDate)} → ${toShortDate(cls.evolution.window.endDate)}` },
  ];
}
