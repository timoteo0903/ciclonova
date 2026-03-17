"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toShortDate } from "@/lib/formatters";

const MetricasDashboard = dynamic(() => import("./MetricasDashboard"), { ssr: false });

type MetricaPeriod = 30 | 60 | 90;

interface MetricaFondo {
  fundId: number;
  fundName: string;
  originalName: string;
  moneda: "ARS" | "USD";
  classId: number;
  className: string;
  returnPct: number | null;
  vcpInicio: number | null;
  vcpFin: number | null;
  aumFin: number | null;
  aumInicio: number | null;
  aumChangePct: number | null;
  dateInicio: string | null;
  dateFin: string | null;
}

const PERIODS: { label: string; value: MetricaPeriod }[] = [
  { label: "30D", value: 30 },
  { label: "60D", value: 60 },
  { label: "90D", value: 90 },
];

// Formatea $ compacto: 26.6MM, 5.6MM, 450M, etc.
function fmtAum(val: number | null): string {
  if (val == null) return "—";
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) return `$\u202F${(val / 1_000_000_000).toLocaleString("es-AR", { maximumFractionDigits: 2 })} MM`;
  if (abs >= 1_000_000) return `$\u202F${(val / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`;
  return `$\u202F${val.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function fmtPct(val: number | null): string {
  if (val == null) return "—";
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

function fmtVcp(val: number | null): string {
  if (val == null) return "—";
  return val.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

const RANK_COLOR = ["#b8870b", "#6b7280", "#9f5325"];

type MetricasTab = "dashboard" | "rankings";

export default function MetricasPanel() {
  const [tab, setTab] = useState<MetricasTab>("dashboard");
  const [period, setPeriod] = useState<MetricaPeriod>(30);
  const [data, setData] = useState<MetricaFondo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/fondos/metricas?days=${period}`)
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        if (!payload.success) throw new Error(payload.error ?? "Error");
        setData(payload.data as MetricaFondo[]);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [period]);

  const arsData = data.filter((f) => f.moneda === "ARS");
  const usdData = data.filter((f) => f.moneda === "USD");

  const topReturnArs = [...arsData]
    .filter((f) => f.returnPct != null)
    .sort((a, b) => (b.returnPct ?? -Infinity) - (a.returnPct ?? -Infinity));

  const topReturnUsd = [...usdData]
    .filter((f) => f.returnPct != null)
    .sort((a, b) => (b.returnPct ?? -Infinity) - (a.returnPct ?? -Infinity));

  const topAumArs = [...arsData]
    .filter((f) => f.aumFin != null)
    .sort((a, b) => (b.aumFin ?? 0) - (a.aumFin ?? 0));

  const topAumUsd = [...usdData]
    .filter((f) => f.aumFin != null)
    .sort((a, b) => (b.aumFin ?? 0) - (a.aumFin ?? 0));

  const dateRef =
    data.find((f) => f.dateInicio && f.dateFin) ?? null;

  return (
    <div className="metricas-panel fade-in">
      {/* Header — solo título + tabs */}
      <div className="metricas-header">
        <h2 style={{ margin: 0 }}>Métricas</h2>
        <div className="metricas-tabs">
          <button
            className={`metricas-tab${tab === "dashboard" ? " metricas-tab--active" : ""}`}
            onClick={() => setTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`metricas-tab${tab === "rankings" ? " metricas-tab--active" : ""}`}
            onClick={() => setTab("rankings")}
          >
            Rankings
          </button>
        </div>
      </div>

      {/* ── Dashboard tab ── */}
      {tab === "dashboard" && <MetricasDashboard />}

      {/* ── Rankings tab ── */}
      {tab === "rankings" && (
        <>
          {/* Controles del período dentro del tab */}
          <div className="metricas-rankings-bar">
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {dateRef?.dateInicio && dateRef?.dateFin
                ? <>{toShortDate(dateRef.dateInicio)} → {toShortDate(dateRef.dateFin)}</>
                : "Seleccioná un período"}
            </p>
            <div className="range-selector">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  className={`range-btn${period === p.value ? " active" : ""}`}
                  onClick={() => setPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div className="metricas-loading">
              <div className="metricas-spinner" />
              <span>Cargando rankings...</span>
            </div>
          )}
          {error && (
            <p className="status status--error" style={{ marginTop: 16 }}>Error: {error}</p>
          )}
          {!loading && !error && data.length > 0 && (
            <div className="metricas-grid">
              <ReturnTable currency="ARS" rows={topReturnArs} period={period} rankColors={RANK_COLOR} />
              <ReturnTable currency="USD" rows={topReturnUsd} period={period} rankColors={RANK_COLOR} />
              <AumTable currency="ARS" rows={topAumArs} period={period} rankColors={RANK_COLOR} />
              <AumTable currency="USD" rows={topAumUsd} period={period} rankColors={RANK_COLOR} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Rendimiento table ─────────────────────────────────────────────────────────

function ReturnTable({
  currency,
  rows,
  period,
  rankColors,
}: {
  currency: "ARS" | "USD";
  rows: MetricaFondo[];
  period: number;
  rankColors: string[];
}) {
  const isArs = currency === "ARS";
  return (
    <div className="mc-card">
      <div className="mc-card-head">
        <div className="mc-card-head-left">
          <span className="mc-card-icon">{isArs ? "📈" : "📈"}</span>
          <div>
            <p className="mc-card-title">Mejor Rendimiento</p>
            <p className="mc-card-sub">
              {isArs ? "Pesos Arg." : "Dólares"} · últimos {period}D
            </p>
          </div>
        </div>
        <span className="mc-currency-chip mc-currency-chip--{isArs ? 'ars' : 'usd'}">
          {isArs ? "🇦🇷 ARS" : "🇺🇸 USD"}
        </span>
      </div>

      <div className="mc-rows">
        {rows.length === 0 && (
          <p className="mc-empty">Sin datos para el período</p>
        )}
        {rows.map((f, i) => {
          const pct = f.returnPct;
          const positive = pct != null && pct > 0;
          const negative = pct != null && pct < 0;
          return (
            <div key={f.fundId} className={`mc-row${i === 0 ? " mc-row--top" : ""}`}>
              <span
                className="mc-rank"
                style={{ color: rankColors[i] ?? "var(--ink-soft)" }}
              >
                {i + 1}
              </span>

              <div className="mc-fund-info">
                <span className="mc-fund-name">{f.fundName}</span>
                <span className="mc-fund-orig">{f.originalName}</span>
              </div>

              <div className="mc-values">
                <span
                  className={`mc-pct-badge${positive ? " mc-pct--pos" : negative ? " mc-pct--neg" : ""}`}
                >
                  {fmtPct(pct)}
                </span>
                <span className="mc-vcp-range">
                  {fmtVcp(f.vcpInicio)}
                  <span className="mc-arrow">→</span>
                  {fmtVcp(f.vcpFin)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AUM table ─────────────────────────────────────────────────────────────────

function AumTable({
  currency,
  rows,
  period,
  rankColors,
}: {
  currency: "ARS" | "USD";
  rows: MetricaFondo[];
  period: number;
  rankColors: string[];
}) {
  const isArs = currency === "ARS";
  return (
    <div className="mc-card">
      <div className="mc-card-head">
        <div className="mc-card-head-left">
          <span className="mc-card-icon">🏦</span>
          <div>
            <p className="mc-card-title">Mayor Patrimonio</p>
            <p className="mc-card-sub">
              {isArs ? "Pesos Arg." : "Dólares"} · últimos {period}D
            </p>
          </div>
        </div>
        <span className="mc-currency-chip">
          {isArs ? "🇦🇷 ARS" : "🇺🇸 USD"}
        </span>
      </div>

      <div className="mc-rows">
        {rows.length === 0 && (
          <p className="mc-empty">Sin datos para el período</p>
        )}
        {rows.map((f, i) => {
          const chg = f.aumChangePct;
          const positive = chg != null && chg > 0;
          const negative = chg != null && chg < 0;
          return (
            <div key={f.fundId} className={`mc-row${i === 0 ? " mc-row--top" : ""}`}>
              <span
                className="mc-rank"
                style={{ color: rankColors[i] ?? "var(--ink-soft)" }}
              >
                {i + 1}
              </span>

              <div className="mc-fund-info">
                <span className="mc-fund-name">{f.fundName}</span>
                <span className="mc-fund-orig">{f.originalName}</span>
              </div>

              <div className="mc-values">
                <span className="mc-aum-value">{fmtAum(f.aumFin)}</span>
                <span
                  className={`mc-pct-badge mc-pct-badge--sm${positive ? " mc-pct--pos" : negative ? " mc-pct--neg" : ""}`}
                >
                  {fmtPct(chg)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
