"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ChartSpline,
  GitBranch,
  Gauge,
  History,
  MapPin,
  ShieldAlert,
  Target,
  TrendingDown,
  Trophy,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { buildAssistantContext } from "@/lib/assistant";
import type { Forecast, Prediction, Source } from "@/lib/types";
import { number, pct, pp, riskLabels } from "@/lib/utils";
import { AiAssistant } from "./ai-assistant";
import { Chart, chartAxis, chartTooltip } from "./chart";
import { PageKpis } from "./page-kpis";
import { ForecastValidation } from "./forecast-validation";
import { SectionCard } from "./section-card";
import { Note, RiskBadge, SourceLink, Status } from "./shared";

const ppAbs = (v: number | null | undefined) => pp(v).replace("+", "");
export function PredictionsView({
  prediction: p,
  states,
  forecast,
  sources,
  loading,
  error,
  retry,
}: {
  prediction?: Prediction;
  states: Prediction[];
  forecast?: Forecast;
  sources?: Source[];
  loading: boolean;
  error: Error | null;
  retry: () => void;
}) {
  const history = useQuery({
    queryKey: ["history", p?.state_code],
    queryFn: ({ signal }) => api.history(p!.state_code, signal),
    enabled: !!p,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const run = forecast?.provenance.model_run_id;
  const metrics = useQuery({
    queryKey: ["metrics", run],
    queryFn: ({ signal }) => api.metrics(run!, signal),
    enabled: !!run,
  });
  const model = metrics.data?.models.find(
    (m) => m.status === "development_selected",
  );
  const observations =
    history.data?.items
      .filter((r) => r.election_type === forecast?.election_type)
      .sort((a, b) => a.year - b.year) ?? [];
  const assistantContext = useMemo(
    () =>
      p && forecast && history.data
        ? buildAssistantContext({
            prediction: p,
            forecast,
            states,
            history: history.data.items,
            thresholds: forecast.calibration.risk.thresholds,
            model: model?.model_name ?? forecast.provenance.model_name,
            maePP: model?.metrics.holdout_2024.mae_pp ?? null,
          })
        : null,
    [p, states, forecast, history.data, model],
  );
  const option = useMemo(() => {
    const last = observations.at(-1);
    return {
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (item: { seriesName: string; value: number[] }) =>
          `${item.seriesName}: ${item.value?.[0]} · ${Number(item.value?.[1]).toFixed(1)}%`,
      },
      legend: {
        bottom: 0,
        left: 0,
        textStyle: { color: "#596D8D", fontSize: 11 },
        itemGap: 18,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
      },
      grid: { left: 44, right: 24, top: 24, bottom: 48 },
      xAxis: {
        ...chartAxis,
        type: "value",
        min: observations[0]?.year ?? 2009,
        max: 2028,
        interval: 3,
        axisLabel: { color: "#596D8D", formatter: (v: number) => String(v) },
        splitLine: { show: false },
      },
      yAxis: {
        ...chartAxis,
        type: "value",
        min: 0,
        max: 100,
        interval: 25,
        axisLabel: { color: "#596D8D", formatter: "{value}%", fontSize: 11 },
      },
      series: [
        {
          name: "Observado · intermedias",
          type: "line",
          symbolSize: 8,
          smooth: 0.25,
          itemStyle: { color: "#83909f" },
          lineStyle: { width: 2 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(131,144,159,0.18)" },
                { offset: 1, color: "rgba(131,144,159,0)" },
              ],
            },
          },
          data: observations.map((r) => [
            r.year,
            r.abstention_rate == null ? null : r.abstention_rate * 100,
          ]),
        },
        {
          name: "Estimado · 2027",
          type: "line",
          symbolSize: 10,
          itemStyle: { color: "#e5007e" },
          lineStyle: { width: 2, type: "dashed" },
          data:
            p && last
              ? [
                  [
                    last.year,
                    last.abstention_rate == null
                      ? null
                      : last.abstention_rate * 100,
                  ],
                  [2027, p.predicted * 100],
                ]
              : [],
          markArea: {
            silent: true,
            itemStyle: {
              color: "rgba(229,0,126,0.10)",
              borderColor: "#f5a9d1",
              borderWidth: 1,
            },
            data: p
              ? [
                  [
                    { xAxis: 2026.4, yAxis: p.lower * 100 },
                    { xAxis: 2027.6, yAxis: p.upper * 100 },
                  ],
                ]
              : [],
          },
        },
      ],
    };
  }, [JSON.stringify(observations), p]);
  if (loading || error || !p || !forecast)
    return (
      <Status
        loading={loading}
        error={error}
        empty={!loading && !error}
        retry={retry}
      />
    );
  const thresholds = forecast.calibration.risk.thresholds;
  const context = p.explanation.context_only;
  const ranked = [...states].sort((a, b) => b.predicted - a.predicted);
  const rank = ranked.findIndex((s) => s.state_code === p.state_code) + 1;
  const counts = (["low", "medium", "high"] as const).map(
    (risk) => states.filter((s) => s.risk_level === risk).length,
  );
  const vsMean = (p.predicted - context.historical_mean_abstention) * 100;
  const contextRows = [
    {
      icon: History,
      label: "Media de abstención comparable",
      value: pct(context.historical_mean_abstention),
      bar: context.historical_mean_abstention,
    },
    {
      icon: TrendingDown,
      label: "Tendencia descriptiva",
      value: `${pp(context.abstention_trend_pp_per_year)} / año`,
      bar: Math.min(1, Math.abs(context.abstention_trend_pp_per_year) / 2),
    },
    {
      icon: Users,
      label: "Brecha previa vs. nacional",
      value: pp(context.previous_gap_vs_national_pp),
      bar: Math.min(1, Math.abs(context.previous_gap_vs_national_pp) / 15),
    },
    {
      icon: ShieldAlert,
      label: "Sin especificar en la referencia",
      value: pct(p.explanation.reference_unspecified_rate),
      bar: p.explanation.reference_unspecified_rate,
    },
  ];
  return (
    <div className="section-page predictions-page">
      <PageKpis
        label="Indicadores de la predicción"
        items={[
          {
            title: "Abstención estimada 2027",
            value: pct(p.predicted),
            reference: `Riesgo ${riskLabels[p.risk_level].toLowerCase()}`,
            icon: Target,
            change: {
              value: pp(Number(vsMean.toFixed(2))),
              label: "vs. media",
              down: vsMean < 0,
            },
            chart: {
              kind: "line",
              values: [
                ...observations
                  .filter((r) => r.abstention_rate != null)
                  .map((r) => r.abstention_rate!),
                p.predicted,
              ],
            },
          },
          {
            title: "Banda de referencia",
            value: ppAbs(Number(((p.upper - p.lower) * 100).toFixed(1))),
            reference: `${pct(p.lower)} – ${pct(p.upper)}`,
            icon: Gauge,
            chart: {
              kind: "band",
              lower: p.lower,
              upper: p.upper,
              value: p.predicted,
            },
          },
          {
            title: "Entidades en riesgo alto",
            value: String(counts[2]),
            reference: `${pct(counts[2] / Math.max(states.length, 1))} del total`,
            icon: ShieldAlert,
            chart: { kind: "bars", values: counts },
          },
          {
            title: "Posición nacional",
            value: rank ? `${rank}°` : "—",
            reference: `de ${states.length} entidades`,
            icon: Trophy,
            chart: {
              kind: "dots",
              filled: states.length - rank + 1,
              total: states.length,
            },
          },
        ]}
      />
      <div className="predictions-main">
        <SectionCard
          id="forecast-chart-title"
          icon={ChartSpline}
          title="Del registro histórico al escenario 2027"
          subtitle={`${p.name} · Abstención · Elecciones intermedias`}
          actions={
            <>
              <span className="section-tag">2027 estimado</span>
              <RiskBadge risk={p.risk_level} />
            </>
          }
          className="forecast-chart-card"
        >
          <Status
            loading={history.isPending}
            error={history.error}
            empty={history.isSuccess && !observations.length}
            retry={() => void history.refetch()}
          />
          {history.isSuccess && observations.length > 0 && (
            <Chart
              option={option}
              label={`Abstención de ${p.name}. Línea continua observada; línea discontinua estimada para 2027 con banda de referencia.`}
              height={440}
            />
          )}
          <div className="forecast-strip">
            <div>
              <span>Abstención estimada</span>
              <strong className="pink">{pct(p.predicted)}</strong>
              <small>Elección intermedia 2027</small>
            </div>
            <div>
              <span>Banda de referencia</span>
              <strong>
                {pct(p.lower)} – {pct(p.upper)}
              </strong>
              <span className="forecast-band-track" aria-hidden="true">
                <i
                  style={{
                    left: `${p.lower * 100}%`,
                    width: `${(p.upper - p.lower) * 100}%`,
                  }}
                />
                <b style={{ left: `${p.predicted * 100}%` }} />
              </span>
            </div>
            <div>
              <span>Participación complementaria</span>
              <strong>{pct(1 - p.predicted)}</strong>
              <small>Sobre SV + NV</small>
            </div>
          </div>
          <p className="section-card-note">
            La franja de 2027 es una banda empírica, no una probabilidad ni una
            garantía de cobertura. El trazo discontinuo identifica el futuro.
          </p>
        </SectionCard>
        <AiAssistant context={assistantContext} />
      </div>
      <div className="section-grid-4">
        <section
          className="section-card forecast-card"
          aria-labelledby="forecast-territory-title"
        >
          <header className="section-card-heading">
            <MapPin className="section-card-icon" aria-hidden="true" />
            <div>
              <span className="section-eyebrow">Estimación territorial</span>
              <h2 id="forecast-territory-title">{p.name}</h2>
            </div>
          </header>
          <div className="forecast-gauge">
            <svg viewBox="0 0 180 112" aria-hidden="true">
              <path
                d="M 18 94 A 72 72 0 0 1 162 94"
                pathLength="100"
                className="forecast-gauge-track"
              />
              <path
                d="M 18 94 A 72 72 0 0 1 162 94"
                pathLength="100"
                className="forecast-gauge-value"
                strokeDasharray={`${p.predicted * 100} 100`}
              />
            </svg>
            <strong className="forecast-value">{pct(p.predicted)}</strong>
            <span>abstención estimada</span>
          </div>
          <div className="forecast-risk">
            <span>Nivel de riesgo</span>
            <RiskBadge risk={p.risk_level} />
          </div>
          <div className="forecast-risk">
            <span>Posibles en la banda</span>
            <strong>
              {p.uncertainty.risk_levels_possible
                .map((r) => riskLabels[r])
                .join(" · ")}
            </strong>
          </div>
          <Note>
            {p.uncertainty.classification_uncertain
              ? `La banda incluye riesgo ${p.uncertainty.risk_levels_possible.map((r) => riskLabels[r].toLowerCase()).join(", ")}.`
              : "La categoría es estable dentro de esta banda de referencia."}
          </Note>
        </section>
        <SectionCard
          id="explanation-title"
          icon={GitBranch}
          title="Qué sostiene esta estimación"
          subtitle={`Última elección del mismo tipo · ${p.explanation.reference_year}`}
        >
          <div className="formula">
            <span>NV / (SV + NV)</span>
            <ArrowRight size={18} />
            <strong>{pct(p.predicted)}</strong>
          </div>
          <dl className="section-facts">
            <div>
              <dt>No votantes (NV)</dt>
              <dd>{number(p.explanation.nonvoter_count)}</dd>
            </div>
            <div>
              <dt>Participación conocida</dt>
              <dd>
                {number(
                  p.explanation.voter_count + p.explanation.nonvoter_count,
                )}
              </dd>
            </div>
          </dl>
          <SourceLink id={p.explanation.source_id} sources={sources} />
          <p className="section-card-note">
            Identidad exacta del baseline; no es un efecto causal.
          </p>
        </SectionCard>
        <SectionCard
          id="context-title"
          icon={History}
          title="Contexto histórico"
          subtitle="Describe el territorio; no entra en la fórmula"
        >
          <ul className="section-bars">
            {contextRows.map((row) => (
              <li key={row.label}>
                <row.icon aria-hidden="true" />
                <span>{row.label}</span>
                <i aria-hidden="true">
                  <b style={{ width: `${Math.max(2, row.bar * 100)}%` }} />
                </i>
                <strong>{row.value}</strong>
              </li>
            ))}
          </ul>
          <p className="section-card-note">
            {context.same_type_history_count} elecciones comparables en el
            histórico.
          </p>
        </SectionCard>
        <SectionCard
          id="validation-title"
          icon={Target}
          title="Modelo y validación temporal"
          subtitle="Desarrollo 2018/2021 · prueba final 2024"
        >
          <Status
            loading={metrics.isPending}
            error={metrics.error}
            retry={() => void metrics.refetch()}
          />
          {model && (
            <>
              <div className="model-stats">
                <div>
                  <span>Modelo seleccionado</span>
                  <strong>{model.model_name}</strong>
                </div>
                <div>
                  <span>MAE · 2024</span>
                  <strong>{ppAbs(model.metrics.holdout_2024.mae_pp)}</strong>
                </div>
              </div>
              <table className="section-table compact">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>MAE desarrollo</th>
                    <th>MAE prueba 2024</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.data?.models.map((m) => (
                    <tr
                      key={m.version}
                      aria-current={
                        m.status === "development_selected" ? "true" : undefined
                      }
                    >
                      <td>{m.model_name}</td>
                      <td>{ppAbs(m.metrics.development.mae_pp)}</td>
                      <td>{ppAbs(m.metrics.holdout_2024.mae_pp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <p className="section-card-note">
            Generado el{" "}
            {new Date(forecast.created_at).toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            })}{" "}
            · corrida {forecast.id}
          </p>
        </SectionCard>
      </div>
      <ForecastValidation forecast={forecast} prediction={p} />
      <Note>
        Semáforo relativo: bajo &lt; {pct(thresholds[0])}; medio desde{" "}
        {pct(thresholds[0])} hasta menos de {pct(thresholds[1])}; alto desde{" "}
        {pct(thresholds[1])}. Soporte limitado: un bloque electoral de
        calibración, sin cobertura garantizada. No es un estándar oficial del
        INE.
      </Note>
    </div>
  );
}
