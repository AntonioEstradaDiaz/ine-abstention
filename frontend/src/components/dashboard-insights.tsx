"use client";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, TrendingUp, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import type { Prediction, Risk } from "@/lib/types";
import { pct, riskLabels } from "@/lib/utils";
import { Chart, chartAxis, chartTooltip } from "./chart";
import { RiskBadge, Status } from "./shared";
import { Button } from "./ui/button";

export function DashboardInsights({
  states,
  selected,
  onSelect,
  onNavigate,
}: {
  states: Prediction[];
  selected: string;
  onSelect: (code: string) => void;
  onNavigate: (view: "trends" | "scenarios" | "ml") => void;
}) {
  const history = useQuery({
    queryKey: ["history", selected],
    queryFn: ({ signal }) => api.history(selected, signal),
  });
  const chosen = states.find((s) => s.state_code === selected);
  const series = (history.data?.items ?? [])
    .filter((r) => r.election_type === "midterm")
    .sort((a, b) => a.year - b.year);
  const ranked = [...states]
    .sort((a, b) => b.predicted - a.predicted)
    .slice(0, 5);
  const name = (s: string) =>
    s
      .toLocaleLowerCase("es-MX")
      .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-MX"));
  const counts = (["low", "medium", "high"] as Risk[]).map((risk) => ({
    risk,
    count: states.filter((s) => s.risk_level === risk).length,
  }));
  return (
    <section
      className="dashboard-insights"
      aria-label="Resumen del análisis territorial"
    >
      <article className="panel insight-card">
        <h2>Entidades con mayor abstención estimada</h2>
        <p className="muted small">2027 · Estimación puntual estatal</p>
        <ol className="risk-ranking">
          {ranked.map((state, i) => (
            <li key={state.state_code}>
              <button
                aria-label={`Seleccionar ${name(state.name)}`}
                aria-pressed={selected === state.state_code}
                onClick={() => onSelect(state.state_code)}
              >
                <span className="ranking-position">{i + 1}</span>
                <span>{name(state.name)}</span>
                <strong>{pct(state.predicted)}</strong>
                <RiskBadge risk={state.risk_level} />
              </button>
            </li>
          ))}
        </ol>
        {!states.length && (
          <p className="muted small">Sin estimaciones disponibles.</p>
        )}
      </article>
      <article className="panel insight-card">
        <h2>
          <TrendingUp size={17} /> Tendencia de participación
        </h2>
        <p className="muted small">
          {chosen ? name(chosen.name) : "Territorio seleccionado"} · Elecciones
          intermedias
        </p>
        <Status
          loading={history.isPending}
          error={history.error}
          retry={() => void history.refetch()}
        />
        {series.length > 0 && (
          <Chart
            label="Participación histórica del estado seleccionado en elecciones intermedias"
            height={155}
            option={{
              color: ["#e5007e"],
              tooltip: {
                ...chartTooltip,
                valueFormatter: (v: number) => `${v.toFixed(1)}%`,
              },
              grid: { left: 42, right: 12, top: 20, bottom: 28 },
              xAxis: {
                ...chartAxis,
                type: "category",
                data: series.map((r) => r.year),
              },
              yAxis: {
                ...chartAxis,
                type: "value",
                min: 0,
                max: 100,
                axisLabel: {
                  color: "#596d8d",
                  formatter: "{value}%",
                  fontSize: 10,
                },
              },
              series: [
                {
                  type: "line",
                  data: series.map((r) =>
                    r.participation_rate == null
                      ? null
                      : r.participation_rate * 100,
                  ),
                  symbolSize: 7,
                  lineStyle: { width: 3 },
                  areaStyle: { opacity: 0.06 },
                },
              ],
            }}
          />
        )}
        <Button variant="ghost" size="sm" onClick={() => onNavigate("trends")}>
          Comparar históricos <ArrowUpRight size={14} />
        </Button>
      </article>
      <article className="panel insight-card">
        <h2>Distribución del riesgo relativo</h2>
        <p className="muted small">Entidades federativas · 2027</p>
        <div
          className="risk-distribution"
          aria-label="Distribución de estados por categoría"
        >
          {counts.map(({ risk, count }) => (
            <div key={risk}>
              <span className={`distribution-dot ${risk}`} />
              <span>{riskLabels[risk]}</span>
              <div className="distribution-track">
                <span
                  className={risk}
                  style={{
                    width: `${states.length ? (count / states.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
        <p className="muted small">
          Clasificación relativa; las bandas pueden cruzar categorías.
        </p>
        <Button variant="ghost" size="sm" onClick={() => onNavigate("ml")}>
          Explorar modelos IA <ArrowUpRight size={14} />
        </Button>
      </article>
      <article className="panel insight-card scenario-preview">
        <h2>
          <SlidersHorizontal size={17} /> Escenarios de participación
        </h2>
        <p>
          Explora cómo cambiaría la abstención ante un cambio supuesto de
          participación.
        </p>
        <div className="scenario-baseline">
          <span>{chosen ? name(chosen.name) : "Selecciona un estado"}</span>
          <strong>{pct(chosen?.predicted)}</strong>
          <small>Abstención estimada · Continuidad 2027</small>
        </div>
        <Button onClick={() => onNavigate("scenarios")}>
          Comparar escenarios <ArrowUpRight size={15} />
        </Button>
        <small className="muted">
          Simulación aritmética: no estima efectos de intervenciones.
        </small>
      </article>
    </section>
  );
}
