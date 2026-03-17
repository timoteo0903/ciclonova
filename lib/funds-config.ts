// ─── Catálogo de fondos IEB S.A. + FCIC ───────────────────────────────────────

export interface FundClassConfig {
  fundId: number;
  classId: number;
  fundName: string;
  className: string; // "Clase A", "Clase B", "Clase Ley N° 27.743", etc.
}

export interface FundConfig {
  fundId: number;
  fundName: string;    // Nombre comercial (visible en UI)
  originalName: string; // Nombre real en CAFCI
  moneda: "ARS" | "USD"; // Moneda de denominación del fondo
  classes: FundClassConfig[];
}

export const ALL_FUNDS: FundConfig[] = [
  // ── MM Pesos (IEB Ahorro) ────────────────────────────────────────────────────
  {
    fundId: 1220,
    fundName: "MM Pesos",
    originalName: "IEB Ahorro",
    moneda: "ARS",
    classes: [
      { fundId: 1220, classId: 3377, fundName: "MM Pesos", className: "Clase A" },
      { fundId: 1220, classId: 3378, fundName: "MM Pesos", className: "Clase B" },
      { fundId: 1220, classId: 3379, fundName: "MM Pesos", className: "Clase C" },
      { fundId: 1220, classId: 3380, fundName: "MM Pesos", className: "Clase D" },
      { fundId: 1220, classId: 3381, fundName: "MM Pesos", className: "Clase E" },
      { fundId: 1220, classId: 4863, fundName: "MM Pesos", className: "Clase Ley N° 27.743" },
    ],
  },

  // ── T+0 Pesos (IEB Ahorro Plus) ─────────────────────────────────────────────
  {
    fundId: 827,
    fundName: "T+0 Pesos",
    originalName: "IEB Ahorro Plus",
    moneda: "ARS",
    classes: [
      { fundId: 827, classId: 2329, fundName: "T+0 Pesos", className: "Clase A" },
      { fundId: 827, classId: 2330, fundName: "T+0 Pesos", className: "Clase B" },
      { fundId: 827, classId: 2331, fundName: "T+0 Pesos", className: "Clase C" },
      { fundId: 827, classId: 2332, fundName: "T+0 Pesos", className: "Clase D" },
      { fundId: 827, classId: 2333, fundName: "T+0 Pesos", className: "Clase E" },
      { fundId: 827, classId: 2334, fundName: "T+0 Pesos", className: "Clase F" },
      { fundId: 827, classId: 4864, fundName: "T+0 Pesos", className: "Clase Ley N° 27.743" },
    ],
  },

  // ── MM Dolar (IEB Corto Plazo Dólar) ────────────────────────────────────────
  {
    fundId: 1600,
    fundName: "MM Dolar",
    originalName: "IEB Corto Plazo Dólar",
    moneda: "USD",
    classes: [
      { fundId: 1600, classId: 5263, fundName: "MM Dolar", className: "Clase A" },
      { fundId: 1600, classId: 5264, fundName: "MM Dolar", className: "Clase B" },
      { fundId: 1600, classId: 5265, fundName: "MM Dolar", className: "Clase Ley N° 27.743" },
    ],
  },

  // ── Dolar Mep (IEB Estratégico) ─────────────────────────────────────────────
  {
    fundId: 1517,
    fundName: "Dolar Mep",
    originalName: "IEB Estratégico",
    moneda: "USD",
    classes: [
      { fundId: 1517, classId: 4538, fundName: "Dolar Mep", className: "Clase A" },
      { fundId: 1517, classId: 4539, fundName: "Dolar Mep", className: "Clase B" },
      { fundId: 1517, classId: 4865, fundName: "Dolar Mep", className: "Clase C" },
    ],
  },

  // ── Ciclo Nova (IEB Estratégico II) ─────────────────────────────────────────
  {
    fundId: 1717,
    fundName: "Ciclo Nova",
    originalName: "IEB Estratégico II",
    moneda: "USD",
    classes: [
      { fundId: 1717, classId: 5772, fundName: "Ciclo Nova", className: "Clase A" },
      { fundId: 1717, classId: 5773, fundName: "Ciclo Nova", className: "Clase B" },
    ],
  },

  // ── CER (IEB Multiestrategia) ────────────────────────────────────────────────
  {
    fundId: 1191,
    fundName: "CER",
    originalName: "IEB Multiestrategia",
    moneda: "ARS",
    classes: [
      { fundId: 1191, classId: 3224, fundName: "CER", className: "Clase A" },
      { fundId: 1191, classId: 3225, fundName: "CER", className: "Clase B" },
      { fundId: 1191, classId: 3226, fundName: "CER", className: "Clase C" },
      { fundId: 1191, classId: 3227, fundName: "CER", className: "Clase D" },
      { fundId: 1191, classId: 3228, fundName: "CER", className: "Clase E" },
      { fundId: 1191, classId: 3229, fundName: "CER", className: "Clase F" },
      { fundId: 1191, classId: 4869, fundName: "CER", className: "Clase Ley N° 27.743" },
    ],
  },

  // ── Lecap T + 0 (IEB Multiestrategia V) ─────────────────────────────────────
  {
    fundId: 1334,
    fundName: "Lecap T + 0",
    originalName: "IEB Multiestrategia V",
    moneda: "ARS",
    classes: [
      { fundId: 1334, classId: 3809, fundName: "Lecap T + 0", className: "Clase A" },
      { fundId: 1334, classId: 3810, fundName: "Lecap T + 0", className: "Clase B" },
      { fundId: 1334, classId: 3811, fundName: "Lecap T + 0", className: "Clase C" },
      { fundId: 1334, classId: 4873, fundName: "Lecap T + 0", className: "Clase Ley N° 27.743" },
    ],
  },

  // ── Dolar Lked (IEB Renta Fija) ─────────────────────────────────────────────
  {
    fundId: 891,
    fundName: "Dolar Lked",
    originalName: "IEB Renta Fija",
    moneda: "ARS",
    classes: [
      { fundId: 891, classId: 2598, fundName: "Dolar Lked", className: "Clase A" },
      { fundId: 891, classId: 2599, fundName: "Dolar Lked", className: "Clase B" },
      { fundId: 891, classId: 2600, fundName: "Dolar Lked", className: "Clase C" },
      { fundId: 891, classId: 2601, fundName: "Dolar Lked", className: "Clase D" },
      { fundId: 891, classId: 2602, fundName: "Dolar Lked", className: "Clase E" },
      { fundId: 891, classId: 2603, fundName: "Dolar Lked", className: "Clase F" },
      { fundId: 891, classId: 4874, fundName: "Dolar Lked", className: "Clase Ley N° 27.743" },
    ],
  },

  // ── Dolar Hard (IEB Renta Fija Dólar) ───────────────────────────────────────
  {
    fundId: 892,
    fundName: "Dolar Hard",
    originalName: "IEB Renta Fija Dólar",
    moneda: "USD",
    classes: [
      { fundId: 892, classId: 2604, fundName: "Dolar Hard", className: "Clase A" },
      { fundId: 892, classId: 2605, fundName: "Dolar Hard", className: "Clase B" },
      { fundId: 892, classId: 2606, fundName: "Dolar Hard", className: "Clase C" },
      { fundId: 892, classId: 4875, fundName: "Dolar Hard", className: "Clase Ley N° 27.743" },
    ],
  },

  // ── T+1 Dolar (IEB Renta Fija Dólar 2) ─────────────────────────────────────
  {
    fundId: 1434,
    fundName: "T+1 Dolar",
    originalName: "IEB Renta Fija Dólar 2",
    moneda: "USD",
    classes: [
      { fundId: 1434, classId: 4204, fundName: "T+1 Dolar", className: "Clase A" },
      { fundId: 1434, classId: 4205, fundName: "T+1 Dolar", className: "Clase B" },
      { fundId: 1434, classId: 4876, fundName: "T+1 Dolar", className: "Clase Ley N° 27.743" },
    ],
  },

  // ── Acciones (IEB Value) ─────────────────────────────────────────────────────
  {
    fundId: 890,
    fundName: "Acciones",
    originalName: "IEB Value",
    moneda: "ARS",
    classes: [
      // classId 2582 no existe en CAFCI (probablemente typo en fuente)
      { fundId: 890, classId: 2593, fundName: "Acciones", className: "Clase B" },
      { fundId: 890, classId: 2594, fundName: "Acciones", className: "Clase C" },
      { fundId: 890, classId: 2595, fundName: "Acciones", className: "Clase D" },
      { fundId: 890, classId: 2596, fundName: "Acciones", className: "Clase E" },
      { fundId: 890, classId: 2597, fundName: "Acciones", className: "Clase F" },
      { fundId: 890, classId: 4878, fundName: "Acciones", className: "Clase Ley N° 27.743" },
    ],
  },

  // ── FCIC Inmobiliario Puerto Nizuc ──────────────────────────────────────────
  {
    fundId: 1445,
    fundName: "FCIC Inmobiliario Puerto Nizuc",
    originalName: "FCIC Inmobiliario Puerto Nizuc",
    moneda: "USD",
    classes: [
      { fundId: 1445, classId: 4247, fundName: "FCIC Inmobiliario Puerto Nizuc", className: "Clase A" },
    ],
  },
];

// ─── Índices rápidos ──────────────────────────────────────────────────────────

export const FUND_BY_ID: Record<number, FundConfig> = Object.fromEntries(
  ALL_FUNDS.map((f) => [f.fundId, f]),
);

export const CLASS_BY_ID: Record<number, FundClassConfig> = Object.fromEntries(
  ALL_FUNDS.flatMap((f) => f.classes.map((c) => [c.classId, c])),
);

export const ALL_CLASS_IDS: number[] = ALL_FUNDS.flatMap((f) =>
  f.classes.map((c) => c.classId),
);
