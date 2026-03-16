import { createClient } from "npm:@supabase/supabase-js@2";

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE = "https://api.pub.cafci.org.ar";
const FETCH_HEADERS = {
  Origin: "https://www.cafci.org.ar",
  Referer: "https://www.cafci.org.ar",
  "User-Agent": "ETL-CAFCI/1.0",
};

const FUND_ID = 1717;
const FICHA_CLASS_IDS = [5772, 5773];

const BATCH_SIZE = 500;
const DELAY_BETWEEN_DATES_MS = 150;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/\s/g, "");
  const commaPos = s.lastIndexOf(",");
  const dotPos = s.lastIndexOf(".");
  const norm = commaPos > dotPos
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(/,/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Devuelve "ayer" en hora argentina (UTC-3). */
function yesterdayArgentina(): string {
  const now = new Date();
  const arg = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  arg.setUTCDate(arg.getUTCDate() - 1);
  return arg.toISOString().slice(0, 10);
}

/** Genera lista de fechas ISO entre from y to (inclusive). */
function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// ─── CAFCI fetch ─────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function fetchFicha(classId: number): Promise<any | null> {
  const url = `${API_BASE}/fondo/${FUND_ID}/clase/${classId}/ficha`;
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  // deno-lint-ignore no-explicit-any
  const body: any = await res.json().catch(() => null);
  if (body?.error || !body?.data?.model) return null;
  return body.data;
}

// deno-lint-ignore no-explicit-any
async function fetchTipoRentaRows(tipoRentaId: number, dateIso: string): Promise<any[]> {
  const url = `${API_BASE}/estadisticas/informacion/diaria/${tipoRentaId}/${dateIso}`;
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return [];
  // deno-lint-ignore no-explicit-any
  const body: any = await res.json().catch(() => null);
  return Array.isArray(body?.data) ? body.data : [];
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

type VcpRecord = {
  fecha: string;
  tipo_renta_id: number;
  fondo_nombre: string;
  vcp: number | null;
  patrimonio: number | null;
  ccp: number | null;
};

type FichaRecord = {
  fecha: string;
  class_id: number;
  // deno-lint-ignore no-explicit-any
  data: any;
};

// ─── Procesar un día ─────────────────────────────────────────────────────────

async function processDate(
  dateIso: string,
  tipoRentaId: number,
  allowedNames: Set<string>,
): Promise<VcpRecord[]> {
  const rows = await fetchTipoRentaRows(tipoRentaId, dateIso);
  const records: VcpRecord[] = [];

  for (const row of rows) {
    const fondo_nombre = String(row.fondo ?? row.nombre ?? "").trim();
    if (!fondo_nombre || !allowedNames.has(fondo_nombre)) continue;
    records.push({
      fecha: dateIso,
      tipo_renta_id: tipoRentaId,
      fondo_nombre,
      vcp: toNumber(row.vcp),
      patrimonio: toNumber(row.patrimonio),
      ccp: toNumber(row.ccp),
    });
  }

  return records;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;

  // Modos:
  //  - Sin params              → ayer (uso del cron diario)
  //  - ?date=YYYY-MM-DD        → un día puntual
  //  - ?date_from=...&date_to= → rango para backfill
  const singleDate = params.get("date");
  const dateFrom = params.get("date_from");
  const dateTo = params.get("date_to") ?? yesterdayArgentina();

  let dates: string[];

  if (singleDate) {
    dates = [singleDate];
  } else if (dateFrom) {
    dates = dateRange(dateFrom, dateTo);
  } else {
    dates = [yesterdayArgentina()];
  }

  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (dates.some((d) => !ISO_RE.test(d))) {
    return new Response(
      JSON.stringify({ error: "Fecha inválida. Usar formato YYYY-MM-DD." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ─── Obtener metadatos del fondo ─────────────────────────────────────────
  // La ficha nos da el tipoRentaId y los nombres exactos de las clases
  // para filtrar solo las filas que nos interesan.

  const fichas = await Promise.all(FICHA_CLASS_IDS.map(fetchFicha));
  const fichaValidas = fichas.filter(Boolean);

  if (fichaValidas.length === 0) {
    return new Response(
      JSON.stringify({ error: "No se pudo obtener la ficha del fondo. API de CAFCI no disponible." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // deno-lint-ignore no-explicit-any
  const tipoRentaId: number = fichaValidas[0].model?.fondo?.tipoRenta?.id;
  if (!tipoRentaId) {
    return new Response(
      JSON.stringify({ error: "No se pudo determinar el tipoRentaId del fondo." }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Nombres exactos de las clases tal como los devuelve la API de estadísticas
  // deno-lint-ignore no-explicit-any
  const allowedNames = new Set<string>(fichaValidas.map((f: any) => String(f.model?.nombre ?? "").trim()).filter(Boolean));

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let totalRows = 0;
  let totalUpserted = 0;
  let datesWithData = 0;
  let datesEmpty = 0;
  const errors: string[] = [];

  // ─── VCP diario ──────────────────────────────────────────────────────────

  for (const dateIso of dates) {
    const records = await processDate(dateIso, tipoRentaId, allowedNames);

    if (!records.length) {
      datesEmpty++;
      if (DELAY_BETWEEN_DATES_MS > 0) await sleep(DELAY_BETWEEN_DATES_MS);
      continue;
    }

    datesWithData++;
    totalRows += records.length;

    // Deduplicar por si CAFCI repite claves en el mismo response
    const deduped = [
      ...new Map(
        records.map((r) => [`${r.fecha}|${r.tipo_renta_id}|${r.fondo_nombre}`, r]),
      ).values(),
    ];

    for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
      const batch = deduped.slice(i, i + BATCH_SIZE);
      const { error, count } = await supabase
        .from("cafci_vcp_diario")
        .upsert(batch, {
          onConflict: "fecha,tipo_renta_id,fondo_nombre",
          count: "exact",
        });

      if (error) {
        errors.push(`${dateIso}: ${error.message}`);
      } else {
        totalUpserted += count ?? batch.length;
      }
    }

    if (DELAY_BETWEEN_DATES_MS > 0) await sleep(DELAY_BETWEEN_DATES_MS);
  }

  // ─── Ficha snapshot ───────────────────────────────────────────────────────
  // Se guarda una vez por corrida con la fecha más reciente del lote.

  const fichaFecha = dates[dates.length - 1];
  const fichaRecords: FichaRecord[] = FICHA_CLASS_IDS
    .map((classId, i) => fichas[i] ? { fecha: fichaFecha, class_id: classId, data: fichas[i] } : null)
    .filter((r): r is FichaRecord => r !== null);

  let fichasUpserted = 0;
  if (fichaRecords.length > 0) {
    const { error, count } = await supabase
      .from("cafci_ficha_snapshot")
      .upsert(fichaRecords, {
        onConflict: "fecha,class_id",
        count: "exact",
      });
    if (error) {
      errors.push(`ficha snapshot: ${error.message}`);
    } else {
      fichasUpserted = count ?? fichaRecords.length;
    }
  }

  return new Response(
    JSON.stringify({
      fund: FUND_ID,
      classes: [...allowedNames],
      tipoRentaId,
      datesRequested: dates.length,
      datesWithData,
      datesEmpty,
      totalRows,
      totalUpserted,
      fichasUpserted,
      ...(errors.length ? { errors } : {}),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
