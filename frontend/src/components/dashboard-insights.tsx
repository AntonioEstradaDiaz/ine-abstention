"use client";
import { DashboardSelect } from "./ui/dashboard-select";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesColumnIncreasing,
  TrendingUp,
  ChartPie,
  FlaskConical,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Election, ElectionType, Prediction, Risk } from "@/lib/types";
import { pct, pp, riskLabels } from "@/lib/utils";
import { Chart, chartAxis, chartTooltip } from "./chart";
import { Status } from "./shared";
import { Button } from "./ui/button";

const name = (s: string) =>
  s
    .toLocaleLowerCase("es-MX")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-MX"));
const palette = ["#83909f", "#e5007e", "#f575b5", "#7c16ff"];
const riskPalette = { high: "#c00063", medium: "#f45ca9", low: "#bec4cb" };
export function DashboardInsights({
  states,
  year,
  elections,
  selected,
  onSelect,
  onNavigate,
  onShowAll,
}: {
  states: Prediction[];
  year: number;
  elections: Election[];
  selected: string;
  onSelect: (code: string) => void;
  onNavigate: (view: "trends" | "scenarios" | "ml", changePP?: number) => void;
  onShowAll: () => void;
}) {
  // The trend follows the electoral process chosen in the header.
  const yearType =
    elections.find((e) => e.year === year)?.election_type ?? "midterm";
  const [type, setType] = useState<ElectionType>(yearType);
  const syncKey = `${year}:${yearType}`;
  const [synced, setSynced] = useState(syncKey);
  if (synced !== syncKey) {
    setSynced(syncKey);
    setType(yearType);
  }
  const [change, setChange] = useState(5.4);
  const codes = [...new Set([selected, "12", "16", "07"])].slice(0, 3);
  const histories = useQueries({
    queries: codes.map((code) => ({
      queryKey: ["history", code],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.history(code, signal),
      enabled: states.length > 0,
    })),
  });
  const records = histories.map((query) =>
    (query.data?.items ?? [])
      .filter((r) => r.election_type === type)
      .sort((a, b) => a.year - b.year),
  );
  const years = [...new Set(records.flat().map((r) => r.year))].sort(
    (a, b) => a - b,
  );
  const national = useQueries({
    queries: years.map((year) => ({
      queryKey: ["summary", year],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.summary(year, signal),
    })),
  });
  const loading =
    states.length > 0 &&
    (histories.some((q) => q.isPending) || national.some((q) => q.isPending));
  const error =
    histories.find((q) => q.error)?.error ??
    national.find((q) => q.error)?.error;
  const chosen = states.find((s) => s.state_code === selected);
  const ranked = [...states]
    .sort((a, b) => b.predicted - a.predicted)
    .slice(0, 5);
  const counts = (["high", "medium", "low"] as Risk[]).map((risk) => ({
    risk,
    count: states.filter((s) => s.risk_level === risk).length,
  }));
  const base = chosen ? 1 - chosen.predicted : null;
  const simulated =
    base == null ? null : Math.max(0, Math.min(1, base + change / 100));
  const applied =
    base == null || simulated == null ? null : (simulated - base) * 100;
  return (
    <section
      className="dashboard-insights lower-dashboard"
      aria-label="Resumen del análisis territorial"
    >
      <article
        className="panel insight-card lower-ranking"
        aria-labelledby="ranking-title"
      >
        <header className="lower-card-heading">
          <ChartNoAxesColumnIncreasing size={18} />
          <h2 id="ranking-title">Entidades con mayor riesgo</h2>
          <button className="lower-see-all" onClick={onShowAll}>
            Ver todas <ArrowRight size={11} />
          </button>
        </header>
        <div className="lower-ranking-heading">
          <span>#</span>
          <span>Entidad</span>
          <span>Abstención 2027</span>
        </div>
        <ol>
          {ranked.map((state, index) => (
            <li key={state.state_code}>
              <button
                aria-label={`Seleccionar ${name(state.name)}`}
                aria-pressed={selected === state.state_code}
                onClick={() => onSelect(state.state_code)}
              >
                <span>{index + 1}</span>
                <span>{name(state.name)}</span>
                <span className="lower-ranking-bar" aria-hidden="true">
                  <i
                    style={{
                      width: `${state.predicted * 100}%`,
                      background:
                        index < 2
                          ? "#cb006b"
                          : index === 2
                            ? "#ed52a0"
                            : "#f5a9d1",
                    }}
                  />
                </span>
                <strong>{pct(state.predicted)}</strong>
              </button>
            </li>
          ))}
        </ol>
        {!states.length && (
          <p className="lower-card-note">Sin estimaciones disponibles.</p>
        )}
        <p className="lower-card-note">
          Clasificación relativa estatal · Estimación puntual
        </p>
      </article>
      <article
        className="panel insight-card lower-trends"
        aria-labelledby="lower-trend-title"
      >
        <header className="lower-card-heading">
          <TrendingUp size={18} />
          <div>
            <h2 id="lower-trend-title">Tendencia de participación</h2>
            <p>
              Comparativa por proceso electoral
              {years.includes(year) ? ` · Proceso ${year}` : ""}
            </p>
          </div>
          <DashboardSelect
            aria-label="Elecciones de la tendencia"
            value={type}
            onChange={(e) => setType(e.target.value as ElectionType)}
          >
            <option value="midterm">Intermedias</option>
            <option value="presidential">Presidenciales</option>
          </DashboardSelect>
        </header>
        <Status
          loading={loading}
          error={error}
          retry={() => {
            histories.forEach((q) => void q.refetch());
            national.forEach((q) => void q.refetch());
          }}
        />
        {!loading && !error && years.length > 0 && (
          <Chart
            label={`Participación nacional y de ${codes.map((code) => name(states.find((s) => s.state_code === code)?.name ?? code)).join(", ")} en elecciones ${type === "midterm" ? "intermedias" : "presidenciales"}`}
            height={171}
            option={{
              color: palette,
              tooltip: {
                ...chartTooltip,
                valueFormatter: (v: number) => `${v.toFixed(1)}%`,
              },
              legend: {
                bottom: 0,
                left: 0,
                itemWidth: 7,
                itemHeight: 7,
                itemGap: 9,
                icon: "circle",
                textStyle: { color: "#596d8d", fontSize: 8 },
                type: "scroll",
              },
              grid: { left: 30, right: 14, top: 22, bottom: 43 },
              xAxis: {
                ...chartAxis,
                type: "category",
                data: years,
                axisLabel: { color: "#596d8d", fontSize: 9 },
                boundaryGap: false,
              },
              yAxis: {
                ...chartAxis,
                type: "value",
                min: 0,
                max: 100,
                interval: 20,
                axisLabel: {
                  color: "#596d8d",
                  fontSize: 8,
                  formatter: "{value}%",
                },
              },
              series: [
                {
                  name: "Nacional",
                  type: "line",
                  data: national.map((q) => {
                    const value = q.data?.items[0]?.participation_rate;
                    return value == null ? null : value * 100;
                  }),
                  symbolSize: 5,
                  lineStyle: { width: 1.5 },
                  markLine: {
                    silent: true,
                    symbol: "none",
                    lineStyle: { color: "#e5007e", type: "dashed", width: 1 },
                    label: {
                      formatter: String(year),
                      color: "#b9005e",
                      fontSize: 9,
                    },
                    data: years.includes(year)
                      ? [{ xAxis: years.indexOf(year) }]
                      : [],
                  },
                },
                ...records.map((rows, i) => ({
                  name: name(
                    states.find((s) => s.state_code === codes[i])?.name ??
                      codes[i],
                  ),
                  type: "line",
                  data: years.map((year) => {
                    const value = rows.find(
                      (r) => r.year === year,
                    )?.participation_rate;
                    return value == null ? null : value * 100;
                  }),
                  symbolSize: 5,
                  lineStyle: { width: 1.5 },
                })),
              ],
            }}
          />
        )}
        <button
          className="lower-detail-link"
          onClick={() => onNavigate("trends")}
        >
          Comparar históricos <ArrowUpRight size={11} />
        </button>
      </article>
      <article
        className="panel insight-card lower-distribution"
        aria-labelledby="lower-risk-title"
      >
        <header className="lower-card-heading">
          <ChartPie size={18} />
          <div>
            <h2 id="lower-risk-title">Distribución nacional del riesgo</h2>
            <p>Porcentaje de estados por nivel de riesgo</p>
          </div>
        </header>
        <div className="lower-donut-layout">
          <div className="lower-donut">
            <Chart
              label={`Distribución del riesgo: ${counts.map((c) => `${riskLabels[c.risk]} ${c.count} estados`).join(", ")}`}
              height={160}
              option={{
                animationDuration: 200,
                tooltip: {
                  trigger: "item",
                  formatter: "{b}: {c} estados ({d}%)",
                },
                series: [
                  {
                    type: "pie",
                    radius: ["67%", "94%"],
                    center: ["50%", "50%"],
                    label: { show: false },
                    labelLine: { show: false },
                    data: counts.map((c) => ({
                      name: riskLabels[c.risk],
                      value: c.count,
                      itemStyle: { color: riskPalette[c.risk] },
                    })),
                  },
                ],
              }}
            />
            <div className="lower-donut-center">
              <strong>{states.length ? "100%" : "—"}</strong>
              <span>{states.length} estados</span>
            </div>
          </div>
          <ul>
            {counts.map(({ risk, count }) => (
              <li key={risk}>
                <i style={{ background: riskPalette[risk] }} />
                <span>{riskLabels[risk]}</span>
                <strong>
                  {states.length ? pct(count / states.length) : "—"}
                </strong>
              </li>
            ))}
          </ul>
        </div>
        <p className="lower-card-note">
          Tres categorías del modelo · No mide municipios
        </p>
      </article>
      <article
        className="panel insight-card lower-scenarios"
        aria-labelledby="lower-scenario-title"
      >
        <header className="lower-card-heading">
          <FlaskConical size={18} />
          <div>
            <h2 id="lower-scenario-title">Escenarios de participación</h2>
            <p>
              {chosen ? name(chosen.name) : "Selecciona un estado"} ·
              Sensibilidad del pronóstico
            </p>
          </div>
        </header>
        <DashboardSelect
          aria-label="Supuesto de participación"
          value={change}
          onChange={(e) => setChange(Number(e.target.value))}
        >
          <option value={3}>Supuesto: +3 pp de participación</option>
          <option value={5.4}>Supuesto: +5.4 pp de participación</option>
          <option value={-3}>Supuesto: −3 pp de participación</option>
        </DashboardSelect>
        <div className="lower-scenario-pair">
          <div>
            <span>Continuidad</span>
            <strong>{pct(base)}</strong>
            <small>Participación estimada</small>
            <span className="lower-participation-track">
              <i style={{ width: `${(base ?? 0) * 100}%` }} />
            </span>
          </div>
          <div>
            <span>Con cambio supuesto</span>
            <div className="lower-scenario-result">
              <strong>{pct(simulated)}</strong>
              <small>{pp(applied)}</small>
            </div>
            <small>Participación estimada</small>
            <span className="lower-participation-track">
              <i style={{ width: `${(simulated ?? 0) * 100}%` }} />
            </span>
          </div>
        </div>
        <Button
          disabled={!chosen}
          onClick={() => onNavigate("scenarios", change)}
        >
          Comparar escenarios <ArrowRight size={14} />
        </Button>
        <p className="lower-card-note">
          Supuesto aritmético, no efecto de una intervención.
        </p>
      </article>
    </section>
  );
}
