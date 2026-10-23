"use client";
import { useId } from "react";
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";

export type KpiChart =
  | { kind: "line"; values: number[] }
  | { kind: "bars"; values: number[] }
  | { kind: "dots"; filled: number; total: number }
  | { kind: "band"; lower: number; upper: number; value: number };
export interface PageKpi {
  title: string;
  value: string;
  reference: string;
  icon: LucideIcon;
  change?: { value: string; label: string; down?: boolean };
  chart?: KpiChart;
}

// Same anatomy as the map's primary metric cards, fed with live values.
export function PageKpis({
  label,
  items,
}: {
  label: string;
  items: PageKpi[];
}) {
  return (
    <section className="page-kpis" aria-label={label}>
      {items.map((item) => (
        <article className="page-kpi" key={item.title} aria-label={item.title}>
          <div className="page-kpi-icon" aria-hidden="true">
            <item.icon />
          </div>
          <div className="page-kpi-body">
            <p className="page-kpi-title">{item.title}</p>
            <div
              className="page-kpi-details"
              data-change={item.change ? "true" : "false"}
            >
              <div className="page-kpi-value">
                <strong>{item.value}</strong>
                <span>{item.reference}</span>
              </div>
              {item.change && (
                <div className="page-kpi-change">
                  <div>
                    {item.change.down ? <ArrowDown /> : <ArrowUp />}
                    <strong>{item.change.value}</strong>
                  </div>
                  <span>{item.change.label}</span>
                </div>
              )}
              {item.chart && <KpiSpark chart={item.chart} />}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function KpiSpark({ chart }: { chart: KpiChart }) {
  const id = useId().replace(/:/g, "");
  let body: React.ReactNode;
  if (chart.kind === "line") {
    const values = chart.values.length > 1 ? chart.values : [0, 0];
    const max = Math.max(...values);
    // Keep small changes small: never stretch less than 30% of the level.
    const span = Math.max(max - Math.min(...values), Math.abs(max) * 0.3) || 1;
    const min = max - span;
    const points = values.map(
      (v, i) =>
        [
          2 + (i * 104) / (values.length - 1),
          52 - ((v - min) / span) * 42,
        ] as const,
    );
    const path = points
      .map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`)
      .join(" ");
    const [lx, ly] = points.at(-1)!;
    body = (
      <svg viewBox="0 0 110 62" preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ed008c" stopOpacity=".28" />
            <stop offset="100%" stopColor="#ed008c" stopOpacity=".02" />
          </linearGradient>
        </defs>
        <path d={`${path} L${lx} 60 L2 60Z`} fill={`url(#${id})`} />
        <path d={path} fill="none" stroke="#ed008c" strokeWidth="1.8" />
        <circle
          cx={lx}
          cy={ly}
          r="4.5"
          fill="#ed008c"
          stroke="white"
          strokeWidth="1.5"
        />
      </svg>
    );
  } else if (chart.kind === "bars") {
    const max = Math.max(...chart.values, 1);
    const width = 104 / chart.values.length;
    const tones = ["#ffd8ed", "#ffc3e2", "#ffacd7", "#ff8dc9", "#fa66b6"];
    body = (
      <svg viewBox="0 0 104 62" preserveAspectRatio="none">
        {chart.values.map((v, i) => {
          const h = Math.max(6, (v / max) * 58);
          return (
            <rect
              key={i}
              x={i * width + 2}
              y={62 - h}
              width={width - 4}
              height={h}
              rx="2.5"
              fill={
                i === chart.values.length - 1
                  ? "#df007b"
                  : tones[Math.min(i, tones.length - 1)]
              }
            />
          );
        })}
      </svg>
    );
  } else if (chart.kind === "dots") {
    const filled = Math.round((chart.filled / Math.max(chart.total, 1)) * 40);
    body = (
      <svg viewBox="0 0 104 66">
        {Array.from({ length: 40 }, (_, i) => (
          <circle
            key={i}
            cx={6 + (i % 8) * 13}
            cy={6 + Math.floor(i / 8) * 13}
            r="4.7"
            fill={
              i < filled ? (i < filled / 2 ? "#df007b" : "#ef55aa") : "#e7e8ec"
            }
          />
        ))}
      </svg>
    );
  } else {
    body = (
      <svg viewBox="0 0 104 62" preserveAspectRatio="none">
        <rect x="2" y="27" width="100" height="8" rx="4" fill="#f7d6e8" />
        <rect
          x={2 + chart.lower * 100}
          y="22"
          width={Math.max(2, (chart.upper - chart.lower) * 100)}
          height="18"
          rx="6"
          fill="#f7a6d1"
        />
        <circle
          cx={2 + chart.value * 100}
          cy="31"
          r="6"
          fill="#df007b"
          stroke="white"
          strokeWidth="2"
        />
      </svg>
    );
  }
  return (
    <div className="page-kpi-chart" aria-hidden="true">
      {body}
    </div>
  );
}
