import { createClient } from "npm:@supabase/supabase-js@2";

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE = "https://api.pub.cafci.org.ar";
const FETCH_HEADERS = {
  Origin: "https://www.cafci.org.ar",
  Referer: "https://www.cafci.org.ar",
  "User-Agent": "ETL-CAFCI/1.0",
};

// Probamos IDs 1-20; los que no existan devuelven vacío y se ignoran.
const TIPO_RENTA_IDS = Array.from({ length: 20 }, (_, i) => i + 1);

const BATCH_SIZE = 500;

// Pausa entre fechas para no saturar la API de CAFCI.
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

// ─── Procesar un día ─────────────────────────────────────────────────────────

type VcpRecord = {
  fecha: string;
  tipo_renta_id: number;
  fondo_nombre: string;
  vcp: number | null;
  patrimonio: number | null;
  ccp: number | null;
};

async function processDate(dateIso: string): Promise<VcpRecord[]> {
  // Los 20 tipoRenta se piden en paralelo para cada fecha.
  const results = await Promise.allSettled(
    TIPO_RENTA_IDS.map(async (id) => ({ id, rows: await fetchTipoRentaRows(id, dateIso) })),
  );

  const records: VcpRecord[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const row of r.value.rows) {
      const fondo_nombre = String(row.fondo ?? row.nombre ?? "").trim();
      if (!fondo_nombre) continue;
      records.push({
        fecha: dateIso,
        tipo_renta_id: r.value.id,
        fondo_nombre,
        vcp: toNumber(row.vcp),
        patrimonio: toNumber(row.patrimonio),
        ccp: toNumber(row.ccp),
      });
    }
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let totalRows = 0;
  let totalUpserted = 0;
  let datesWithData = 0;
  let datesEmpty = 0;
  const errors: string[] = [];

  for (const dateIso of dates) {
    const records = await processDate(dateIso);

    if (!records.length) {
      datesEmpty++;
      if (DELAY_BETWEEN_DATES_MS > 0) await sleep(DELAY_BETWEEN_DATES_MS);
      continue;
    }

    datesWithData++;
    totalRows += records.length;

    // Deduplicar: CAFCI a veces devuelve la misma clave dos veces en el mismo response.
    const deduped = [
      ...new Map(
        records.map((r) => [`${r.fecha}|${r.tipo_renta_id}|${r.fondo_nombre}`, r]),
      ).values(),
    ];

    // Upsert en batches
    for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
      const batch = deduped.slice(i, i + BATCH_SIZE);
      const { error, count } = await supabase
        .from("cafci_vcp_diario")
        .upsert(batch, {
          onConflict: "fecha,tipo_renta_id,fondo_nombre",
          count: "exact",
        });

      if (error) {
        errors.push(`${dateIso} batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        totalUpserted += count ?? batch.length;
      }
    }

    if (DELAY_BETWEEN_DATES_MS > 0) await sleep(DELAY_BETWEEN_DATES_MS);
  }

  return new Response(
    JSON.stringify({
      datesRequested: dates.length,
      datesWithData,
      datesEmpty,
      totalRows,
      totalUpserted,
      ...(errors.length ? { errors } : {}),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
