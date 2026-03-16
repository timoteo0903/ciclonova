import type {
  Overview,
  Evolution,
  EvolutionPoint,
  EvolutionStats,
  ReturnData,
  CombinedAum,
  CombinedAumPoint,
  DashboardData,
  DashboardClassesData,
} from "./types";
import { readPersistedCache, writePersistedCache } from "./persistent-cache";
import { supabase } from "./supabase";

// ─── Fund config ──────────────────────────────────────────────────────────────

const FUND_ID = 1717;

const CLASS_CONFIGS = {
  5772: {
    classId: 5772,
    label: "Clase A",
    alias: "Ciclo Nova",
    sourceUrl: "https://www.cafci.org.ar/ficha-fondo.html?q=1717;5772",
  },
  5773: {
    classId: 5773,
    label: "Clase B",
    alias: "Ciclo Nova",
    sourceUrl: "https://www.cafci.org.ar/ficha-fondo.html?q=1717;5773",
  },
} as const;

type ClassId = keyof typeof CLASS_CONFIGS;
export const CLASS_A_ID: ClassId = 5772;
export const CLASS_B_ID: ClassId = 5773;

const API_BASE = "https://api.pub.cafci.org.ar";
const API_HEADERS = {
  Origin: "https://www.cafci.org.ar",
  Referer: "https://www.cafci.org.ar/ficha-fondo.html?q=1717;5772",
  "User-Agent": "Ciclo-Nova-Dashboard/1.0",
};

// ─── In-memory cache ──────────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { cache.delete(key); return null; }
  return hit.value;
}

function cacheSet<T>(key: string, value: T, ttlMs: number): T {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

async function getCached<T>(key: string, ttlMs: number, producer: () => Promise<T>): Promise<T> {
  const fromCache = cacheGet<T>(key);
  if (fromCache !== null) return fromCache;

  const persisted = await readPersistedCache<T>(key);
  const now = Date.now();
  if (persisted && persisted.expiresAt > now) {
    return cacheSet(key, persisted.value, Math.max(1_000, persisted.expiresAt - now));
  }

  try {
    const value = await producer();
    cacheSet(key, value, ttlMs);
    void writePersistedCache(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      savedAt: Date.now(),
    });
    return value;
  } catch (error) {
    if (persisted) {
      // Fallback to stale persisted value if the upstream API is temporarily unavailable.
      return cacheSet(key, persisted.value, 60_000);
    }
    throw error;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const commaPos = raw.lastIndexOf(",");
  const dotPos = raw.lastIndexOf(".");
  let normalized = raw.replace(/\s/g, "");
  if (commaPos > dotPos) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = normalized.replace(/,/g, "");
  }
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseCafciDate(input: unknown): Date | null {
  if (!input) return null;
  const parts = String(input).split("/");
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  let year = Number(parts[2]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeText(input: unknown): string {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ─── CAFCI fetch ──────────────────────────────────────────────────────────────

async function fetchJson(url: string, timeoutMs = 20000): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: API_HEADERS, signal: controller.signal });
    const bodyText = await response.text();
    let payload: unknown = null;
    try { payload = bodyText ? JSON.parse(bodyText) : null; } catch { payload = null; }
    if (!response.ok) throw new Error(`HTTP ${response.status} en ${url} :: ${bodyText.slice(0, 240)}`);
    if (payload === null) throw new Error(`Respuesta no JSON en ${url}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Supabase readers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFichaFromDb(classId: number): Promise<any | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("cafci_ficha_snapshot")
    .select("data")
    .eq("class_id", classId)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.data;
}

async function getEvolutionPointsFromDb(
  tipoRentaId: number,
  className: string,
  startDateIso: string,
  endDateIso: string,
): Promise<EvolutionPoint[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("cafci_vcp_diario")
    .select("fecha, vcp, patrimonio, ccp")
    .eq("tipo_renta_id", tipoRentaId)
    .eq("fondo_nombre", className)
    .gte("fecha", startDateIso)
    .lte("fecha", endDateIso)
    .order("fecha");
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((row) => ({
    date: String(row.fecha),
    vcp: row.vcp as number | null,
    aum: row.patrimonio as number | null,
    ccp: row.ccp as number | null,
  }));
}

async function getCombinedAumPointsFromDb(
  tipoRentaId: number,
  classNameA: string,
  classNameB: string,
  startDateIso: string,
  endDateIso: string,
): Promise<CombinedAumPoint[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("cafci_vcp_diario")
    .select("fecha, fondo_nombre, patrimonio")
    .eq("tipo_renta_id", tipoRentaId)
    .in("fondo_nombre", [classNameA, classNameB])
    .gte("fecha", startDateIso)
    .lte("fecha", endDateIso)
    .order("fecha");
  if (error || !data) return [];

  const byDate = new Map<string, { aumA: number | null; aumB: number | null }>();
  for (const row of data) {
    const date = String(row.fecha);
    if (!byDate.has(date)) byDate.set(date, { aumA: null, aumB: null });
    const entry = byDate.get(date)!;
    if (row.fondo_nombre === classNameA) entry.aumA = row.patrimonio as number | null;
    else if (row.fondo_nombre === classNameB) entry.aumB = row.patrimonio as number | null;
  }

  return Array.from(byDate.entries())
    .filter(([, v]) => v.aumA !== null || v.aumB !== null)
    .map(([date, { aumA, aumB }]) => ({
      date,
      aumA,
      aumB,
      aumTotal: aumA !== null || aumB !== null ? (aumA ?? 0) + (aumB ?? 0) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Ficha (per-class) ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFichaRaw(classId: number): Promise<any> {
  return getCached(`ficha:${classId}`, 5 * 60 * 1000, async () => {
    const dbFicha = await getFichaFromDb(classId);
    if (dbFicha) return dbFicha;

    const url = `${API_BASE}/fondo/${FUND_ID}/clase/${classId}/ficha`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await fetchJson(url) as any;
    if (response.error || !response.data || !response.data.model) {
      throw new Error(`Error en ficha (clase ${classId}): ${response.error ?? "respuesta inválida"}`);
    }
    return response.data;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReturn(data: any): ReturnData | null {
  if (!data) return null;
  return { sinceDate: data.fecha ?? null, returnPct: toNumber(data.rendimiento), tnaPct: toNumber(data.tna) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildOverviewFromFicha(ficha: any, classId: number): Overview {
  const config = CLASS_CONFIGS[classId as ClassId] ?? CLASS_CONFIGS[CLASS_A_ID];
  const model = ficha.model ?? {};
  const fondo = model.fondo ?? {};
  const info = ficha.info ?? {};
  const diaria = info.diaria ?? {};
  const actual = diaria.actual ?? {};
  const rendimientos = diaria.rendimientos ?? {};
  const mensual = info.mensual ?? {};
  const honorarios = mensual.honorariosComisiones ?? {};
  const semanal = info.semanal ?? {};
  const cartera = Array.isArray(semanal.carteras) ? semanal.carteras : [];

  const positiveHoldings = cartera
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => ({ asset: item.nombreActivo ?? "Activo sin nombre", sharePct: toNumber(item.share) }))
    .filter((item: { sharePct: number | null }) => item.sharePct !== null && item.sharePct > 0)
    .sort((a: { sharePct: number }, b: { sharePct: number }) => b.sharePct - a.sharePct);

  const portfolioTop = positiveHoldings.slice(0, 12);
  const portfolioTotalPct = positiveHoldings.reduce(
    (sum: number, item: { sharePct: number }) => sum + item.sharePct, 0,
  );

  return {
    fund: {
      fundId: FUND_ID,
      classId: config.classId,
      classLabel: config.label,
      alias: config.alias,
      className: model.nombre ?? "N/D",
      fundName: fondo.nombre ?? "N/D",
      tipoRenta: fondo.tipoRenta?.nombre ?? "N/D",
      tipoRentaId: fondo.tipoRenta?.id ?? null,
      tipoFondo: fondo.tipoFondo?.nombre ?? "N/D",
      moneda: fondo.moneda?.nombre ?? fondo.moneda?.codigoCafci ?? "N/D",
      gerente: fondo.gerente?.nombre ?? "N/D",
      depositaria: fondo.depositaria?.nombre ?? "N/D",
      benchmark: fondo.benchmark?.nombre ?? "No informado",
      horizonte: fondo.horizonte?.nombre ?? "N/D",
      liquidezDias: fondo.diasLiquidacion ?? null,
      inversionMinima: toNumber(honorarios.minimoInversion ?? model.inversionMinima),
      createdAt: model.createdAt ?? null,
      sourceUrl: config.sourceUrl,
    },
    asOfDate: actual.fecha ?? diaria.referenceDay ?? null,
    current: {
      vcpUnitario: toNumber(actual.vcpUnitario),
      vcpPorMil: toNumber(actual.vcp),
      aum: toNumber(actual.patrimonio),
      aumNetoFondo: toNumber(actual.patrimonioNetoFondo),
    },
    returns: {
      day: mapReturn(rendimientos.day),
      month: mapReturn(rendimientos.month),
      year: mapReturn(rendimientos.year),
      trailing12m: mapReturn(rendimientos.monthYear),
      oneYear: mapReturn(rendimientos.oneYear),
      threeYears: mapReturn(rendimientos.threeYears),
      fiveYears: mapReturn(rendimientos.fiveYears),
    },
    fees: {
      adminGerentePct: toNumber(honorarios.honorariosAdministracionGerente),
      adminDepositariaPct: toNumber(honorarios.honorariosAdministracionDepositaria),
      gastoGestionPct: toNumber(honorarios.gastosGestion),
      comisionIngresoPct: toNumber(honorarios.comisionIngreso),
      comisionRescatePct: toNumber(honorarios.comisionRescate),
      comisionTransferenciaPct: toNumber(honorarios.comisionTransferencia),
      honorariosExito: honorarios.honorariosExito ?? null,
    },
    portfolio: {
      asOfDate: semanal.fechaDatos ?? null,
      totalPositiveSharePct: Number(portfolioTotalPct.toFixed(4)),
      topHoldings: portfolioTop,
      holdings: positiveHoldings,
    },
  };
}

// ─── Daily data — shared raw cache (one API call per date regardless of class) ─

async function getDailyRawRows(tipoRentaId: number, dateIso: string): Promise<unknown[]> {
  return getCached(`daily-raw:${tipoRentaId}:${dateIso}`, 10 * 365 * 24 * 60 * 60 * 1000, async () => {
    const url = `${API_BASE}/estadisticas/informacion/diaria/${tipoRentaId}/${dateIso}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = await fetchJson(url) as any;
    return Array.isArray(payload.data) ? payload.data : [];
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDailyRow(row: any, fallbackDateIso: string): EvolutionPoint {
  const parsed = parseCafciDate(row.fecha);
  return {
    date: parsed ? toISODate(parsed) : fallbackDateIso,
    vcp: toNumber(row.vcp),
    aum: toNumber(row.patrimonio),
    ccp: toNumber(row.ccp),
  };
}

function findClassRow(rows: unknown[], className: string, dateIso: string): EvolutionPoint | null {
  if (!rows.length) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = rows as any[];
  const exact = r.find((row) => row.fondo === className);
  if (exact) return normalizeDailyRow(exact, dateIso);
  const target = normalizeText(className);
  const fuzzy = r.find((row) => normalizeText(row.fondo) === target);
  return fuzzy ? normalizeDailyRow(fuzzy, dateIso) : null;
}

async function getDailyRowForClass(
  tipoRentaId: number,
  className: string,
  dateIso: string,
): Promise<EvolutionPoint | null> {
  const rows = await getDailyRawRows(tipoRentaId, dateIso);
  return findClassRow(rows, className, dateIso);
}

// ─── Evolution ────────────────────────────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  workerFn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const size = items.length;
  if (size === 0) return [];
  const output = new Array<R>(size);
  let index = 0;
  async function worker() {
    while (true) {
      const current = index++;
      if (current >= size) break;
      try { output[current] = await workerFn(items[current], current); }
      catch { output[current] = null as R; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, size) }, worker));
  return output;
}

function computeEvolutionStats(points: EvolutionPoint[]): EvolutionStats {
  if (points.length < 2) {
    return { points: points.length, sinceInceptionReturnPct: null, aumChangePct: null, maxDrawdownPct: null, annualizedVolatilityPct30d: null };
  }
  const first = points[0], last = points[points.length - 1];
  const sinceInceptionReturnPct = first.vcp && last.vcp ? (last.vcp / first.vcp - 1) * 100 : null;

  let firstAum: number | null = null;
  for (const p of points) { if (p.aum !== null) { firstAum = p.aum; break; } }
  let lastAum: number | null = null;
  for (let i = points.length - 1; i >= 0; i--) { if (points[i].aum !== null) { lastAum = points[i].aum; break; } }
  const aumChangePct = firstAum && lastAum ? (lastAum / firstAum - 1) * 100 : null;

  let peak = -Infinity, maxDrawdownPct = 0;
  for (const p of points) {
    if (p.vcp === null) continue;
    if (p.vcp > peak) peak = p.vcp;
    if (peak > 0) { const d = (p.vcp / peak - 1) * 100; if (d < maxDrawdownPct) maxDrawdownPct = d; }
  }

  const dailyReturns: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].vcp, curr = points[i].vcp;
    if (prev && curr) dailyReturns.push(curr / prev - 1);
  }
  const last30 = dailyReturns.slice(-30);
  let annualizedVolatilityPct30d: number | null = null;
  if (last30.length >= 10) {
    const mean = last30.reduce((s, v) => s + v, 0) / last30.length;
    const variance = last30.reduce((s, v) => s + (v - mean) ** 2, 0) / (last30.length - 1);
    annualizedVolatilityPct30d = Math.sqrt(Math.max(variance, 0)) * Math.sqrt(252) * 100;
  }

  return { points: points.length, sinceInceptionReturnPct, aumChangePct, maxDrawdownPct, annualizedVolatilityPct30d };
}

function buildDateRange(daysParam: string, currentDate: Date, inceptionDate: Date) {
  const normalized = String(daysParam || "180").toLowerCase();
  const isAll = normalized === "all";
  let days = Number(normalized);
  if (!Number.isFinite(days) || days < 15) days = 180;
  days = Math.min(days, 900);
  let startDate = isAll ? inceptionDate : addDays(currentDate, -(days - 1));
  if (startDate < inceptionDate) startDate = inceptionDate;
  const dateList: string[] = [];
  for (let d = new Date(startDate); d <= currentDate; d = addDays(d, 1)) dateList.push(toISODate(d));
  return { startDate, dateList, isAll, days };
}

async function buildEvolution(daysParam: string, classId: number): Promise<Evolution> {
  const ficha = await getFichaRaw(classId);
  const className: string = ficha.model?.nombre;
  const tipoRentaId: number = ficha.model?.fondo?.tipoRenta?.id;
  if (!className || !tipoRentaId) throw new Error("No se pudo determinar clase o tipo de renta.");

  const currentDate = parseCafciDate(ficha.info?.diaria?.actual?.fecha) ?? new Date();
  const inceptionDate = ficha.model?.createdAt ? new Date(ficha.model.createdAt) : addDays(currentDate, -365);
  const { startDate, dateList, isAll, days } = buildDateRange(daysParam, currentDate, inceptionDate);

  // Intento 1: lectura bulk desde Supabase (una sola query en vez de N llamadas HTTP)
  const dbPoints = await getEvolutionPointsFromDb(tipoRentaId, className, toISODate(startDate), toISODate(currentDate));

  let points: EvolutionPoint[];
  if (dbPoints.length > 0) {
    points = dbPoints.filter((p) => p.vcp !== null).sort((a, b) => a.date.localeCompare(b.date));
  } else {
    // Fallback: API de CAFCI fecha por fecha
    const pointsRaw = await mapWithConcurrency(dateList, 6, (dateIso) =>
      getDailyRowForClass(tipoRentaId, className, dateIso),
    );
    points = (pointsRaw.filter((p) => p && p.vcp !== null) as EvolutionPoint[])
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return {
    window: {
      requested: isAll ? "all" : days,
      startDate: toISODate(startDate),
      endDate: toISODate(currentDate),
      queriedDays: dateList.length,
      points: points.length,
    },
    stats: computeEvolutionStats(points),
    points,
  };
}

// ─── Combined AUM (both classes, one API call per date via shared raw cache) ──

async function buildCombinedAumEvolution(daysParam: string): Promise<CombinedAum> {
  const [fichaA, fichaB] = await Promise.all([getFichaRaw(CLASS_A_ID), getFichaRaw(CLASS_B_ID)]);

  const classNameA: string = fichaA.model?.nombre;
  const classNameB: string = fichaB.model?.nombre;
  // Both classes belong to the same fund → same tipoRentaId → one API call per date
  const tipoRentaId: number = fichaA.model?.fondo?.tipoRenta?.id;
  if (!classNameA || !classNameB || !tipoRentaId) {
    throw new Error("No se pudo determinar datos base para el AUM combinado.");
  }

  const currentDate = parseCafciDate(fichaA.info?.diaria?.actual?.fecha) ?? new Date();
  const inceptionA = fichaA.model?.createdAt ? new Date(fichaA.model.createdAt) : addDays(currentDate, -365);
  const inceptionB = fichaB.model?.createdAt ? new Date(fichaB.model.createdAt) : addDays(currentDate, -365);
  const inceptionDate = inceptionA < inceptionB ? inceptionA : inceptionB;

  const { startDate, dateList } = buildDateRange(daysParam, currentDate, inceptionDate);

  // Intento 1: lectura bulk desde Supabase
  const dbPoints = await getCombinedAumPointsFromDb(tipoRentaId, classNameA, classNameB, toISODate(startDate), toISODate(currentDate));

  let points: CombinedAumPoint[];
  if (dbPoints.length > 0) {
    points = dbPoints;
  } else {
    // Fallback: API de CAFCI fecha por fecha
    const pointsRaw = await mapWithConcurrency(dateList, 6, async (dateIso) => {
      const rows = await getDailyRawRows(tipoRentaId, dateIso);
      const rowA = findClassRow(rows, classNameA, dateIso);
      const rowB = findClassRow(rows, classNameB, dateIso);
      const aumA = rowA?.aum ?? null;
      const aumB = rowB?.aum ?? null;
      const aumTotal = aumA !== null || aumB !== null ? (aumA ?? 0) + (aumB ?? 0) : null;
      return { date: dateIso, aumA, aumB, aumTotal } as CombinedAumPoint;
    });
    points = (pointsRaw.filter((p): p is CombinedAumPoint => p !== null && p.aumTotal !== null))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  const currentAumA = toNumber(fichaA.info?.diaria?.actual?.patrimonio);
  const currentAumB = toNumber(fichaB.info?.diaria?.actual?.patrimonio);

  return {
    currentAumA,
    currentAumB,
    currentTotalAum: currentAumA !== null || currentAumB !== null
      ? (currentAumA ?? 0) + (currentAumB ?? 0)
      : null,
    points,
    window: { startDate: toISODate(startDate), endDate: toISODate(currentDate), points: points.length },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

type ClassDashboardData = Omit<DashboardData, "combinedAum">;

async function getClassDashboardData(days: string, classId: number): Promise<ClassDashboardData> {
  const isAll = days === "all";
  const [ficha, evolution, allEvolution] = await Promise.all([
    getFichaRaw(classId),
    getCached(`evolution:${classId}:${days}`, 10 * 60 * 1000, () => buildEvolution(days, classId)),
    isAll
      ? Promise.resolve(null)
      : getCached(`evolution:${classId}:all`, 10 * 60 * 1000, () => buildEvolution("all", classId)),
  ]);

  const overview = buildOverviewFromFicha(ficha, classId);
  const inceptionStats = isAll ? evolution.stats : (allEvolution?.stats ?? null);
  return { overview, evolution, inceptionStats };
}

export async function getDashboardData(days: string, classId: number): Promise<DashboardData> {
  const [classData, combinedAum] = await Promise.all([
    getClassDashboardData(days, classId),
    getCached(`combined-aum:${days}`, 10 * 60 * 1000, () => buildCombinedAumEvolution(days)),
  ]);

  return { ...classData, combinedAum };
}

export async function getDashboardClassesData(days: string): Promise<DashboardClassesData> {
  const [classAData, classBData, combinedAum] = await Promise.all([
    getClassDashboardData(days, CLASS_A_ID),
    getClassDashboardData(days, CLASS_B_ID),
    getCached(`combined-aum:${days}`, 10 * 60 * 1000, () => buildCombinedAumEvolution(days)),
  ]);

  return {
    classA: { ...classAData, combinedAum },
    classB: { ...classBData, combinedAum },
    combinedAum,
  };
}

export async function getDashboardClassesDataCached(days: string): Promise<DashboardClassesData> {
  if (!supabase) throw new Error("Supabase no configurado.");

  // ── 1. Overview, fees y portfolio desde el cache pre-computado ──────────────
  const { data: cacheRow, error: cacheErr } = await supabase
    .from("cafci_dashboard_cache")
    .select("data")
    .eq("cache_key", "classes:all")
    .maybeSingle();

  if (cacheErr) throw new Error(`Error leyendo cache: ${cacheErr.message}`);
  if (!cacheRow) throw new Error("Cache vacía. Ejecutá el refresh primero desde /api/fondo/refresh.");

  const cached = cacheRow.data as DashboardClassesData;

  // ── 2. Evolución desde ciclo_nova_diario (cualquier ventana) ────────────────
  const normalized = String(days).toLowerCase();
  const isAll = normalized === "all";
  const daysNum = isAll ? null : Math.max(15, Math.min(900, Number(normalized) || 180));
  const sinceDate = daysNum
    ? new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildQuery(classId: number): any {
    const q = supabase!
      .from("ciclo_nova_diario")
      .select("fecha, vcp, aum, ccp")
      .eq("class_id", classId)
      .order("fecha");
    return sinceDate ? q.gte("fecha", sinceDate) : q;
  }

  const [{ data: rowsA, error: errA }, { data: rowsB, error: errB }] = await Promise.all([
    buildQuery(CLASS_A_ID),
    buildQuery(CLASS_B_ID),
  ]);

  if (errA) throw new Error(`Error leyendo diario clase A: ${errA.message}`);
  if (errB) throw new Error(`Error leyendo diario clase B: ${errB.message}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toPoints = (rows: any[]): EvolutionPoint[] =>
    rows
      .filter((r) => r.vcp !== null)
      .map((r) => ({ date: String(r.fecha), vcp: r.vcp, aum: r.aum, ccp: r.ccp }));

  const pointsA = toPoints(rowsA ?? []);
  const pointsB = toPoints(rowsB ?? []);

  const buildEvolutionObj = (points: EvolutionPoint[], requested: string | number): Evolution => ({
    window: {
      requested,
      startDate: points[0]?.date ?? "",
      endDate: points[points.length - 1]?.date ?? "",
      queriedDays: points.length,
      points: points.length,
    },
    stats: computeEvolutionStats(points),
    points,
  });

  const evolutionA = buildEvolutionObj(pointsA, isAll ? "all" : daysNum!);
  const evolutionB = buildEvolutionObj(pointsB, isAll ? "all" : daysNum!);

  // ── 3. Combined AUM desde los puntos de ambas clases ────────────────────────
  const aumByDate = new Map<string, { aumA: number | null; aumB: number | null }>();
  for (const p of pointsA) {
    aumByDate.set(p.date, { aumA: p.aum, aumB: null });
  }
  for (const p of pointsB) {
    const entry = aumByDate.get(p.date) ?? { aumA: null, aumB: null };
    entry.aumB = p.aum;
    aumByDate.set(p.date, entry);
  }
  const combinedPoints: CombinedAumPoint[] = Array.from(aumByDate.entries())
    .map(([date, { aumA, aumB }]) => ({
      date,
      aumA,
      aumB,
      aumTotal: aumA !== null || aumB !== null ? (aumA ?? 0) + (aumB ?? 0) : null,
    }))
    .filter((p) => p.aumTotal !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const combinedAum: CombinedAum = {
    currentAumA: cached.combinedAum.currentAumA,
    currentAumB: cached.combinedAum.currentAumB,
    currentTotalAum: cached.combinedAum.currentTotalAum,
    points: combinedPoints,
    window: {
      startDate: combinedPoints[0]?.date ?? "",
      endDate: combinedPoints[combinedPoints.length - 1]?.date ?? "",
      points: combinedPoints.length,
    },
  };

  return {
    classA: { overview: cached.classA.overview, evolution: evolutionA, inceptionStats: computeEvolutionStats(pointsA), combinedAum },
    classB: { overview: cached.classB.overview, evolution: evolutionB, inceptionStats: computeEvolutionStats(pointsB), combinedAum },
    combinedAum,
  };
}
