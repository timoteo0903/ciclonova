export interface MetricRow {
  name: string;
  value: string;
  rawValue?: number | null;
}

interface MetricListProps {
  rows: MetricRow[];
}

export default function MetricList({ rows }: MetricListProps) {
  return (
    <div className="metric-list">
      {rows.map((row) => {
        const valueClass = [
          "metric-value",
          row.rawValue != null && row.rawValue > 0 ? "positive" : "",
          row.rawValue != null && row.rawValue < 0 ? "negative" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={row.name} className="metric-row">
            <span className="metric-name">{row.name}</span>
            <span className={valueClass}>{row.value}</span>
          </div>
        );
      })}
    </div>
  );
}
