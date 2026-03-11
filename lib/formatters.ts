export const fmtNumber2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
export const fmtNumber4 = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
export const fmtCurrencyArs = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});

export function formatPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "N/D";
  const num = Number(value);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(digits)}%`;
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/D";
  return fmtCurrencyArs.format(Number(value));
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "N/D";
  const num = Number(value);
  if (digits === 4) return fmtNumber4.format(num);
  if (digits === 0) return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(num);
  return fmtNumber2.format(num);
}

export function toShortDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "N/D";
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
