export interface FundInfo {
  fundId: number;
  classId: number;
  classLabel: string;
  alias: string;
  className: string;
  fundName: string;
  tipoRenta: string;
  tipoRentaId: number | null;
  tipoFondo: string;
  moneda: string;
  gerente: string;
  depositaria: string;
  benchmark: string;
  horizonte: string;
  liquidezDias: number | null;
  inversionMinima: number | null;
  createdAt: string | null;
  sourceUrl: string;
}

export interface ReturnData {
  sinceDate: string | null;
  returnPct: number | null;
  tnaPct: number | null;
}

export interface Holding {
  asset: string;
  sharePct: number;
}

export interface Overview {
  fund: FundInfo;
  asOfDate: string | null;
  current: {
    vcpUnitario: number | null;
    vcpPorMil: number | null;
    aum: number | null;
    aumNetoFondo: number | null;
  };
  returns: {
    day: ReturnData | null;
    month: ReturnData | null;
    year: ReturnData | null;
    trailing12m: ReturnData | null;
    oneYear: ReturnData | null;
    threeYears: ReturnData | null;
    fiveYears: ReturnData | null;
  };
  fees: {
    adminGerentePct: number | null;
    adminDepositariaPct: number | null;
    gastoGestionPct: number | null;
    comisionIngresoPct: number | null;
    comisionRescatePct: number | null;
    comisionTransferenciaPct: number | null;
    honorariosExito: string | null;
  };
  portfolio: {
    asOfDate: string | null;
    totalPositiveSharePct: number;
    topHoldings: Holding[];
    holdings: Holding[];
  };
}

export interface EvolutionPoint {
  date: string;
  vcp: number | null;
  aum: number | null;
  ccp: number | null;
}

export interface EvolutionStats {
  points: number;
  sinceInceptionReturnPct: number | null;
  aumChangePct: number | null;
  maxDrawdownPct: number | null;
  annualizedVolatilityPct30d: number | null;
}

export interface Evolution {
  window: {
    requested: number | string;
    startDate: string;
    endDate: string;
    queriedDays: number;
    points: number;
  };
  stats: EvolutionStats;
  points: EvolutionPoint[];
}

export interface CombinedAumPoint {
  date: string;
  aumA: number | null;
  aumB: number | null;
  aumTotal: number | null;
}

export interface CombinedAum {
  currentAumA: number | null;
  currentAumB: number | null;
  currentTotalAum: number | null;
  points: CombinedAumPoint[];
  window: {
    startDate: string;
    endDate: string;
    points: number;
  };
}

export interface DashboardData {
  overview: Overview;
  evolution: Evolution;
  inceptionStats: EvolutionStats | null;
  combinedAum: CombinedAum;
}

export interface DashboardClassesData {
  classA: DashboardData;
  classB: DashboardData;
  combinedAum: CombinedAum;
}
