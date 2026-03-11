interface KpiCardProps {
  label: string;
  value: string;
  sub: string;
  colorClass?: "positive" | "negative" | "neutral";
}

export default function KpiCard({ label, value, sub, colorClass = "neutral" }: KpiCardProps) {
  const valueClass = colorClass === "positive"
    ? "kpi-value positive"
    : colorClass === "negative"
    ? "kpi-value negative"
    : "kpi-value";

  return (
    <article className="kpi-card">
      <p className="kpi-label">{label}</p>
      <p className={valueClass}>{value}</p>
      <p className="kpi-sub">{sub}</p>
    </article>
  );
}
