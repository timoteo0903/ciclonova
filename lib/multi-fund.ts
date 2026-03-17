import type {
  Overview,
  Evolution,
  EvolutionPoint,
  EvolutionStats,
  MultiFundClassData,
  MultiFundDashboard,
  BenchmarkSeries,
  BenchmarkData,
} from "./types";
import {
  toNumber,
  parseCafciDate,
  toISODate,
  addDays,
  normalizeText,
  fetchJson,
  getCached,
  mapWithConcurrency,
  computeEvolutionStats,
  buildDateRange,
  getDailyRawRows,
  findClassRow,
} from "./cafci";
import { supabase } from "./supabase";
import { ALL_FUNDS, FUND_BY_ID, CLASS_BY_ID } from "./funds-config";

const API_BASE = "https://api.pub.cafci.org.ar";

// ─── Paleta de colores para benchmark ─────────────────────────────────────────

const BENCHMARK_COLORS = [
  "#5f2bd7", "#e07b00", "#0f8f5d", "#be2d66", "#2146a6",
  "#b05c00", "#057a55", "#6d28d9", "#dc2626", "#0369a1",
  "#7c3aed", "#c2410c", "#065f46", "#9f1239", "#1e40af",
];

export function getBenchmarkColor(index: number): string {
  return BENCHMARK_COLORS[index % BENCHMARK_COLORS.length];
}

// ─── Ficha genérica ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getFundFichaRaw(fundId: number, classId: number): Promise<any> {
  return getCached(`ficha:${fundId}:${classId}`, 5 * 60 * 1000, async () => {
    const url = `${API_BASE}/fondo/${fundId}/clase/${classId}/ficha`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await fetchJson(url) as any;
    if (response.error || !response.data || !response.data.model) {
      throw new Error(`Error en ficha (fondo ${fundId}, clase ${classId}): ${response.error ?? "respuesta inválida"}`);
    }
    return response.data;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapReturn(data: any) {
  if (!data) return null;
  return { sinceDate: data.fecha ?? null, returnPct: toNumber(data.rendimiento), tnaPct: toNumber(data.tna) };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildGenericOverview(ficha: any, fundId: number, classId: number): Overview {
  const classConfig = CLASS_BY_ID[classId];
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

  const className = classConfig?.className ?? model.nombre ?? "N/D";
  const fundName = classConfig?.fundName ?? fondo.nombre ?? "N/D";

  return {
    fund: {
      fundId,
      classId,
      classLabel: className,
      alias: fundName,
      className: model.nombre ?? "N/D",
      fundName: fondo.nombre ?? fundName,
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
      sourceUrl: `https://www.cafci.org.ar/ficha-fondo.html?q=${fundId};${classId}`,
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

// ─── Evolución desde Supabase ─────────────────────────────────────────────────

async function getEvolutionFromDb(
  classId: number,
  startDateIso: string,
  endDateIso: string,
): Promise<EvolutionPoint[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("ieb_fondos_diario")
    .select("fecha, vcp, aum, ccp")
    .eq("clase_id", classId)
    .gte("fecha", startDateIso)
    .lte("fecha", endDateIso)
    .order("fecha");
  if (error || !data) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((r) => ({
    date: String(r.fecha),
    vcp: r.vcp as number | null,
    aum: r.aum as number | null,
    ccp: r.ccp as number | null,
  }));
}

// ─── Evolución completa de una clase ─────────────────────────────────────────

async function buildClassEvolution(
  fundId: number,
  classId: number,
  daysParam: string,
): Promise<Evolution> {
  const ficha = await getFundFichaRaw(fundId, classId);
  const className: string = ficha.model?.nombre;
  const tipoRentaId: number = ficha.model?.fondo?.tipoRenta?.id;
  if (!className || !tipoRentaId) throw new Error(`No se pudo determinar clase/tipoRenta para fondo ${fundId} clase ${classId}`);

  const currentDate = parseCafciDate(ficha.info?.diaria?.actual?.fecha) ?? new Date();
  const inceptionDate = ficha.model?.createdAt ? new Date(ficha.model.createdAt) : addDays(currentDate, -365);
  const { startDate, dateList, isAll, days } = buildDateRange(daysParam, currentDate, inceptionDate);

  // 1. Intentar desde ieb_fondos_diario
  const dbPoints = await getEvolutionFromDb(classId, toISODate(startDate), toISODate(currentDate));

  let points: EvolutionPoint[];
  if (dbPoints.length > 0) {
    points = dbPoints.filter((p) => p.vcp !== null).sort((a, b) => a.date.localeCompare(b.date));
  } else {
    // 2. Fallback: API de CAFCI fecha por fecha (cafci_vcp_diario o estadísticas)
    const pointsRaw = await mapWithConcurrency(dateList, 6, (dateIso) =>
      getDailyRawRows(tipoRentaId, dateIso).then((rows) => findClassRow(rows, className, dateIso)),
    );
    points = (pointsRaw.filter((p) => p && p.vcp !== null) as EvolutionPoint[])
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Usar la fecha del primer dato real, no la fecha de creación del fondo en CAFCI
  const actualStartDate = points.length > 0 ? points[0].date : toISODate(startDate);

  return {
    window: {
      requested: isAll ? "all" : days,
      startDate: actualStartDate,
      endDate: toISODate(currentDate),
      queriedDays: dateList.length,
      points: points.length,
    },
    stats: computeEvolutionStats(points),
    points,
  };
}

// ─── Dashboard completo de un fondo ──────────────────────────────────────────

export async function getMultiFundDashboard(
  fundId: number,
  daysParam: string,
): Promise<MultiFundDashboard> {
  const fundConfig = FUND_BY_ID[fundId];
  if (!fundConfig) throw new Error(`Fondo ${fundId} no encontrado en la configuración.`);

  // Procesamos clases con concurrencia limitada para no saturar la API
  const classResults: MultiFundClassData[] = await mapWithConcurrency(
    fundConfig.classes,
    4,
    async (cls) => {
      const isAll = daysParam === "all";
      const [ficha, evolution, allEvolution] = await Promise.all([
        getFundFichaRaw(cls.fundId, cls.classId),
        getCached(
          `mf-evolution:${cls.classId}:${daysParam}`,
          10 * 60 * 1000,
          () => buildClassEvolution(cls.fundId, cls.classId, daysParam),
        ),
        isAll
          ? Promise.resolve(null)
          : getCached(
              `mf-evolution:${cls.classId}:all`,
              10 * 60 * 1000,
              () => buildClassEvolution(cls.fundId, cls.classId, "all"),
            ),
      ]);

      const overview = buildGenericOverview(ficha, cls.fundId, cls.classId);
      const inceptionEvolution = isAll ? evolution : allEvolution;
      const inceptionStats = isAll ? evolution.stats : (allEvolution?.stats ?? null);
      const inceptionStartDate = inceptionEvolution?.window.startDate ?? null;

      return {
        classId: cls.classId,
        className: cls.className,
        overview,
        evolution,
        inceptionStats,
        inceptionStartDate,
      };
    },
  );

  // AUM total actual = suma de todas las clases
  const totalAumNow = classResults.reduce((sum, c) => {
    const aum = c.overview.current.aum;
    return aum !== null ? sum + aum : sum;
  }, 0) || null;

  // Historia AUM combinado: alinear puntos por fecha y sumar
  const aumByDate = new Map<string, number>();
  for (const cls of classResults) {
    for (const p of cls.evolution.points) {
      if (p.aum === null) continue;
      aumByDate.set(p.date, (aumByDate.get(p.date) ?? 0) + p.aum);
    }
  }
  const aumHistoryPoints = Array.from(aumByDate.entries())
    .map(([date, aumTotal]) => ({ date, aumTotal }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    fundId,
    fundName: fundConfig.fundName,
    classes: classResults,
    totalAumNow,
    aumHistoryPoints,
  };
}

// ─── Benchmark: comparar múltiples fondos ────────────────────────────────────

export async function getBenchmarkData(
  fundIds: number[],
  daysParam: string,
): Promise<BenchmarkData> {
  // Para cada fondo, usamos la Clase A (o la primera clase disponible)
  const targets = fundIds
    .map((id) => {
      const fund = FUND_BY_ID[id];
      if (!fund) return null;
      const cls = fund.classes[0]; // Clase A o primera disponible
      return { fundId: id, fundName: fund.fundName, classId: cls.classId, className: cls.className };
    })
    .filter(Boolean) as { fundId: number; fundName: string; classId: number; className: string }[];

  const seriesResults = await mapWithConcurrency(targets, 3, async (target, idx) => {
    try {
      const evolution = await getCached(
        `mf-evolution:${target.classId}:${daysParam}`,
        10 * 60 * 1000,
        () => buildClassEvolution(target.fundId, target.classId, daysParam),
      );
      const pts = evolution.points;
      const firstVcp = pts.find((p) => p.vcp !== null)?.vcp ?? null;
      const returnPoints = pts.map((p) => ({
        date: p.date,
        returnPct: firstVcp && p.vcp !== null ? Number(((p.vcp / firstVcp - 1) * 100).toFixed(4)) : null,
      }));
      const lastReturn = returnPoints.filter((p) => p.returnPct !== null).at(-1)?.returnPct ?? null;

      return {
        fundId: target.fundId,
        fundName: target.fundName,
        classId: target.classId,
        className: target.className,
        color: getBenchmarkColor(idx),
        points: returnPoints,
        inceptionReturnPct: lastReturn,
      } satisfies BenchmarkSeries;
    } catch {
      return null;
    }
  });

  const series = seriesResults.filter(Boolean) as BenchmarkSeries[];
  const allDates = series.flatMap((s) => s.points.map((p) => p.date)).sort();
  const startDate = allDates[0] ?? "";
  const endDate = allDates[allDates.length - 1] ?? "";

  return { series, startDate, endDate };
}

// ─── Backfill eficiente: fecha-primero + batch upsert ────────────────────────

/**
 * Recorre el rango de fechas UNA vez por tipoRentaId (no por clase).
 * Ventajas vs. backfillFundRange:
 *  - 1 llamada CAFCI por (tipoRentaId × fecha) en vez de por (clase × fecha)
 *  - 1 upsert Supabase por día (batch) en vez de 1 por fila
 *
 * Mejora ~10x para rangos grandes con muchas clases.
 */
export async function backfillAllFundsRange(
  fromDateIso: string,
  toDateIso: string,
  filterFundId?: number | null,
): Promise<{ upserted: number; skipped: number; errors: string[] }> {
  if (!supabase) return { upserted: 0, skipped: 0, errors: [] };

  // 1. Clases a procesar
  const fundsToProcess = filterFundId
    ? ALL_FUNDS.filter((f) => f.fundId === filterFundId)
    : ALL_FUNDS;
  const allClasses = fundsToProcess.flatMap((f) => f.classes);

  // 2. Fichas en paralelo → tipoRentaId + className por clase
  type ClassMeta = { tipoRentaId: number; className: string; fundId: number; normalizedName: string };
  const classMeta = new Map<number, ClassMeta>();
  const fichaErrors: string[] = [];

  await mapWithConcurrency(allClasses, 8, async (cls) => {
    try {
      const ficha = await getFundFichaRaw(cls.fundId, cls.classId);
      const tipoRentaId: number = ficha.model?.fondo?.tipoRenta?.id;
      const className: string = ficha.model?.nombre;
      if (tipoRentaId && className) {
        classMeta.set(cls.classId, {
          tipoRentaId,
          className,
          fundId: cls.fundId,
          normalizedName: normalizeText(className),
        });
      }
    } catch (err) {
      fichaErrors.push(`${cls.className} (${cls.classId}): ${err instanceof Error ? err.message : "ficha error"}`);
    }
  });

  // 3. Agrupar clases por tipoRentaId
  const byTipoRenta = new Map<number, ClassMeta & { classId: number }[]>();
  for (const [classId, meta] of classMeta.entries()) {
    if (!byTipoRenta.has(meta.tipoRentaId)) byTipoRenta.set(meta.tipoRentaId, []);
    byTipoRenta.get(meta.tipoRentaId)!.push({ ...meta, classId });
  }

  // 4. Lista de fechas
  const dates: string[] = [];
  const cur = new Date(fromDateIso + "T00:00:00Z");
  const end = new Date(toDateIso + "T00:00:00Z");
  while (cur <= end) {
    dates.push(toISODate(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  // 5. Por cada fecha: 1 call CAFCI por tipoRentaId → batch upsert
  let totalUpserted = 0;
  let totalSkipped = 0;

  await mapWithConcurrency(dates, 5, async (dateIso) => {
    const rowsForDate: DiarioRow[] = [];

    for (const [tipoRentaId, classes] of byTipoRenta.entries()) {
      let rows: unknown[];
      try {
        rows = (await getDailyRawRows(tipoRentaId, dateIso)) as unknown[];
      } catch {
        totalSkipped += classes.length;
        continue;
      }

      for (const cls of classes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = rows as any[];
        const match =
          r.find((row) => row.fondo === cls.className) ??
          r.find((row) => normalizeText(row.fondo) === cls.normalizedName);

        if (!match) { totalSkipped++; continue; }
        const norm = normalizeDailyRowLocal(match, dateIso);
        if (norm.vcp === null) { totalSkipped++; continue; }

        rowsForDate.push({
          fecha: dateIso,
          fondo_id: cls.fundId,
          clase_id: cls.classId,
          vcp: norm.vcp,
          aum: norm.aum,
          ccp: norm.ccp,
        });
      }
    }

    if (rowsForDate.length > 0) {
      const { error } = await supabase!
        .from("ieb_fondos_diario")
        .upsert(rowsForDate, { onConflict: "fecha,clase_id" });
      if (!error) totalUpserted += rowsForDate.length;
      else totalSkipped += rowsForDate.length;
    }
  });

  return { upserted: totalUpserted, skipped: totalSkipped, errors: fichaErrors };
}

// ─── Sync a ieb_fondos_diario ─────────────────────────────────────────────────

interface DiarioRow {
  fecha: string;
  fondo_id: number;
  clase_id: number;
  vcp: number | null;
  aum: number | null;
  ccp: number | null;
}

export async function syncFundToday(fundId: number, classId: number): Promise<DiarioRow | null> {
  if (!supabase) return null;
  try {
    const ficha = await getFundFichaRaw(fundId, classId);
    const model = ficha.model ?? {};
    const diaria = ficha.info?.diaria ?? {};
    const actual = diaria.actual ?? {};

    // Fecha del dato (formato DD/MM/YY de la API)
    const rawFecha = actual.fecha ?? diaria.referenceDay ?? null;
    const parsed = parseCafciDate(rawFecha);
    if (!parsed) return null;
    const fecha = toISODate(parsed);

    const row: DiarioRow = {
      fecha,
      fondo_id: fundId,
      clase_id: classId,
      vcp: toNumber(actual.vcp),
      aum: toNumber(actual.patrimonio),
      ccp: null,
    };

    await supabase.from("ieb_fondos_diario").upsert(row, { onConflict: "fecha,clase_id" });
    return row;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeDailyRowLocal(row: any, dateIso: string) {
  return {
    vcp: toNumber(row.vcp),
    aum: toNumber(row.patrimonio),
    ccp: toNumber(row.ccp),
    fecha: dateIso,
  };
}

// Backfill histórico: recorre fechas y upserts en ieb_fondos_diario
export async function backfillFundRange(
  fundId: number,
  classId: number,
  fromDateIso: string,
  toDateIso: string,
): Promise<{ upserted: number; skipped: number }> {
  if (!supabase) return { upserted: 0, skipped: 0 };

  // Obtener metadatos de la clase (tipoRentaId y nombre exacto)
  const ficha = await getFundFichaRaw(fundId, classId);
  const className: string = ficha.model?.nombre;
  const tipoRentaId: number = ficha.model?.fondo?.tipoRenta?.id;
  if (!className || !tipoRentaId) return { upserted: 0, skipped: 0 };

  const normalizedName = normalizeText(className);

  // Generar lista de fechas
  const dates: string[] = [];
  const cur = new Date(fromDateIso + "T00:00:00Z");
  const end = new Date(toDateIso + "T00:00:00Z");
  while (cur <= end) {
    dates.push(toISODate(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  let upserted = 0;
  let skipped = 0;

  await mapWithConcurrency(dates, 3, async (dateIso) => {
    const rows = await getDailyRawRows(tipoRentaId, dateIso);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = rows as any[];
    const match =
      r.find((row) => row.fondo === className) ??
      r.find((row) => normalizeText(row.fondo) === normalizedName);

    if (!match) {
      skipped++;
      return;
    }

    const norm = normalizeDailyRowLocal(match, dateIso);
    if (norm.vcp === null) { skipped++; return; }

    const row: DiarioRow = {
      fecha: dateIso,
      fondo_id: fundId,
      clase_id: classId,
      vcp: norm.vcp,
      aum: norm.aum,
      ccp: norm.ccp,
    };

    const { error } = await supabase!
      .from("ieb_fondos_diario")
      .upsert(row, { onConflict: "fecha,clase_id" });

    if (!error) upserted++;
    else skipped++;
  });

  return { upserted, skipped };
}

// Refresh de hoy para todos los fondos (llamado nocturnamente)
export async function refreshAllFundsToday(): Promise<{
  synced: number;
  failed: number;
  details: { classId: number; fundName: string; ok: boolean }[];
}> {
  const allClasses = ALL_FUNDS.flatMap((f) =>
    f.classes.map((c) => ({ fundId: f.fundId, classId: c.classId, fundName: f.fundName })),
  );

  let synced = 0;
  let failed = 0;
  const details: { classId: number; fundName: string; ok: boolean }[] = [];

  await mapWithConcurrency(allClasses, 8, async (cls) => {
    const row = await syncFundToday(cls.fundId, cls.classId);
    const ok = row !== null;
    if (ok) synced++; else failed++;
    details.push({ classId: cls.classId, fundName: cls.fundName, ok });
  });

  return { synced, failed, details };
}
