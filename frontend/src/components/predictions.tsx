"use client";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, GitBranch, Target } from "lucide-react";
import { api } from "@/lib/api";
import type { Forecast, Prediction, Source } from "@/lib/types";
import { number, pct, pp } from "@/lib/utils";
import { Chart, chartAxis, chartTooltip } from "./chart";
import { Note, RiskBadge, SourceLink, Status } from "./shared";

export function PredictionsView({
  prediction: p,
  forecast,
  sources,
  loading,
  error,
  retry,
}: {
  prediction?: Prediction;
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
        textStyle: { color: "#596D8D", fontSize: 11 },
        itemGap: 22,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
      },
      grid: { left: 48, right: 35, top: 30, bottom: 60 },
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
          itemStyle: { color: "#91A6C4" },
          lineStyle: { width: 2 },
          data: observations.map((r) => [
            r.year,
            r.abstention_rate == null ? null : r.abstention_rate * 100,
          ]),
        },
        {
          name: "Estimado · 2027",
          type: "line",
          symbolSize: 10,
          itemStyle: { color: "#C4006B" },
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
              color: "rgba(165,109,226,0.20)",
              borderColor: "#C4006B",
              borderWidth: 1,
            },
            data: p
              ? [
                  [
                    { xAxis: 2026.5, yAxis: p.lower * 100 },
                    { xAxis: 2027.5, yAxis: p.upper * 100 },
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
  return (
    <>
      <div className="prediction-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Del registro histórico al escenario futuro</h2>
              <p>{p.name} · Abstención · Elecciones intermedias</p>
            </div>
            <span className="tag-purple">2027 estimado</span>
          </div>
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
              height={340}
            />
          )}
          <div className="panel-note">
            <Note>
              La franja de 2027 representa una banda empírica, no una
              probabilidad ni una garantía de cobertura. El trazo discontinuo
              identifica el futuro.
            </Note>
          </div>
        </section>
        <aside className="panel forecast-card">
          <span className="eyebrow">ESTIMACIÓN TERRITORIAL · 2027</span>
          <h2>{p.name}</h2>
          <strong className="forecast-value">{pct(p.predicted)}</strong>
          <span className="muted">abstención estimada</span>
          <RiskBadge risk={p.risk_level} />
          <div className="band-display">
            <span>Banda de referencia</span>
            <strong>
              {pct(p.lower)} – {pct(p.upper)}
            </strong>
          </div>
          <p className="small muted">
            Participación complementaria:{" "}
            <strong>{pct(1 - p.predicted)}</strong>
          </p>
          <Note>
            {p.uncertainty.classification_uncertain
              ? `La banda incluye riesgo ${p.uncertainty.risk_levels_possible.map((r) => ({ low: "bajo", medium: "medio", high: "alto" })[r]).join(", ")}.`
              : "La categoría es estable dentro de esta banda de referencia."}
          </Note>
        </aside>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Qué sostiene esta estimación</h2>
            <p>
              Identidad exacta del baseline; las variables contextuales no son
              efectos causales.
            </p>
          </div>
          <GitBranch size={20} className="purple-text" />
        </div>
        <div className="explanation-grid">
          <div>
            <span className="eyebrow">VARIABLE UTILIZADA</span>
            <h3>
              Última elección del mismo tipo · {p.explanation.reference_year}
            </h3>
            <div className="formula">
              <span>NV / (SV + NV)</span>
              <ArrowRight size={20} />
              <strong>{pct(p.predicted)}</strong>
            </div>
            <p className="small muted">
              {number(p.explanation.nonvoter_count)} no votantes /{" "}
              {number(p.explanation.voter_count + p.explanation.nonvoter_count)}{" "}
              personas con participación conocida.
            </p>
            <SourceLink id={p.explanation.source_id} sources={sources} />
          </div>
          <div className="context-facts">
            <h3>Contexto histórico</h3>
            <div>
              <span>Media de abstención comparable</span>
              <strong>
                {pct(p.explanation.context_only.historical_mean_abstention)}
              </strong>
            </div>
            <div>
              <span>Tendencia descriptiva</span>
              <strong>
                {pp(p.explanation.context_only.abstention_trend_pp_per_year)} /
                año
              </strong>
            </div>
            <div>
              <span>Elecciones del mismo tipo</span>
              <strong>
                {p.explanation.context_only.same_type_history_count}
              </strong>
            </div>
            <p className="small muted">
              Estas variables describen el territorio; no contribuyen a la
              fórmula de este modelo.
            </p>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Modelo y validación temporal</h2>
            <p>
              Selección con desarrollo 2018/2021; prueba final 2024 sin cambiar
              la selección.
            </p>
          </div>
          <Target size={19} className="muted" />
        </div>
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
                <small>{model.version}</small>
              </div>
              <div>
                <span>Error absoluto medio · 2024</span>
                <strong>
                  {pp(model.metrics.holdout_2024.mae_pp).replace("+", "")}
                </strong>
                <small>Prueba temporal · 32 estados</small>
              </div>
              <div>
                <span>Generado</span>
                <strong>
                  {new Date(forecast.created_at).toLocaleDateString("es-MX", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </strong>
                <small>Corrida {forecast.id}</small>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>Estado</th>
                    <th>MAE desarrollo</th>
                    <th>MAE prueba 2024</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.data?.models.map((m) => (
                    <tr key={m.version}>
                      <td>{m.model_name}</td>
                      <td>
                        {m.status === "development_selected"
                          ? "Seleccionado"
                          : "Candidato"}
                      </td>
                      <td>
                        {pp(m.metrics.development.mae_pp).replace("+", "")}
                      </td>
                      <td>
                        {pp(m.metrics.holdout_2024.mae_pp).replace("+", "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="panel-note">
          <Note>
            Semáforo relativo: bajo &lt; {pct(thresholds[0])}; medio desde{" "}
            {pct(thresholds[0])} hasta menos de {pct(thresholds[1])}; alto desde{" "}
            {pct(thresholds[1])}. Soporte limitado: un bloque electoral de
            calibración, sin cobertura garantizada. No es un estándar oficial
            del INE.
          </Note>
        </div>
      </section>
    </>
  );
}
