"use client";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChartSpline,
  FlaskConical,
  Gauge,
  ListChecks,
  Play,
  RotateCcw,
  Scale,
  SlidersHorizontal,
  Target,
  Vote,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Forecast, Prediction } from "@/lib/types";
import { pct, pp, riskLabels } from "@/lib/utils";
import { Button } from "./ui/button";
import { Chart, chartAxis, chartTooltip } from "./chart";
import { PageKpis } from "./page-kpis";
import { SectionCard } from "./section-card";
import { Note, RiskBadge, Status } from "./shared";

const presets = [-5, -3, 0, 3, 5.4, 10];
const clamp = (v: number) => Math.max(0, Math.min(1, v));

export function Scenarios({
  prediction,
  forecast,
  initialChange = 3,
  loading,
  error,
  retry,
}: {
  prediction?: Prediction;
  forecast?: Forecast;
  initialChange?: number;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}) {
  if (loading || error || !prediction || !forecast)
    return (
      <Status
        loading={loading}
        error={error}
        empty={!loading && !error}
        retry={retry}
      />
    );
  return (
    <ScenarioForm
      key={`${prediction.state_code}-${forecast.id}-${initialChange}`}
      prediction={prediction}
      forecast={forecast}
      initialChange={initialChange}
    />
  );
}

function ScenarioGauge({
  label,
  value,
  active,
}: {
  label: string;
  value: number | null;
  active?: boolean;
}) {
  return (
    <div className="scenario-gauge" data-active={active ? "true" : "false"}>
      <svg viewBox="0 0 180 112" aria-hidden="true">
        <path
          d="M 18 94 A 72 72 0 0 1 162 94"
          pathLength="100"
          className="forecast-gauge-track"
        />
        {value != null && (
          <path
            d="M 18 94 A 72 72 0 0 1 162 94"
            pathLength="100"
            className="forecast-gauge-value"
            strokeDasharray={`${value * 100} 100`}
          />
        )}
      </svg>
      <strong>{pct(value)}</strong>
      <span>{label}</span>
    </div>
  );
}

function ScenarioForm({
  prediction: p,
  forecast,
  initialChange,
}: {
  prediction: Prediction;
  forecast: Forecast;
  initialChange: number;
}) {
  const [input, setInput] = useState(String(initialChange));
  const change = input.trim() === "" ? NaN : Number(input);
  const valid = Number.isFinite(change) && change >= -100 && change <= 100;
  const mutation = useMutation({
    mutationFn: ({
      code,
      delta,
      run,
    }: {
      code: string;
      delta: number;
      run: string;
    }) => api.simulate(code, delta, run),
  });
  const matching =
    valid &&
    mutation.data?.result.parameters.participation_change_pp === change &&
    mutation.data?.result.states[0]?.state_code === p.state_code;
  const result = matching ? mutation.data?.result.states[0] : undefined;
  const run = () => {
    if (valid && !mutation.isPending)
      mutation.mutate({ code: p.state_code, delta: change, run: forecast.id });
  };
  const reset = () => {
    setInput("0");
    mutation.reset();
  };
  const preview = forecast.provenance.mode === "preview";
  // Arithmetic sensitivity curve: the same identity the API applies, shown for context.
  const sensitivity = useMemo(() => {
    const xs = Array.from({ length: 41 }, (_, i) => i - 20);
    return {
      tooltip: {
        ...chartTooltip,
        valueFormatter: (v: number) => `${Number(v).toFixed(1)}%`,
      },
      legend: {
        data: ["Banda de referencia", "Abstención"],
        bottom: 0,
        left: 0,
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: "#596D8D", fontSize: 11 },
      },
      grid: { left: 40, right: 16, top: 16, bottom: 46 },
      xAxis: {
        ...chartAxis,
        type: "category",
        data: xs.map((x) => `${x > 0 ? "+" : ""}${x}`),
        boundaryGap: false,
        axisLabel: { color: "#596D8D", fontSize: 10, interval: 4 },
        name: "pp",
      },
      yAxis: {
        ...chartAxis,
        type: "value",
        min: 0,
        max: 100,
        interval: 25,
        axisLabel: { color: "#596D8D", fontSize: 10, formatter: "{value}%" },
      },
      series: [
        {
          name: "Banda inferior",
          type: "line",
          stack: "band",
          symbol: "none",
          lineStyle: { opacity: 0 },
          data: xs.map((x) => clamp(p.lower - x / 100) * 100),
          tooltip: { show: false },
        },
        {
          name: "Banda de referencia",
          type: "line",
          stack: "band",
          symbol: "none",
          lineStyle: { opacity: 0 },
          areaStyle: { color: "rgba(229,0,126,0.10)" },
          itemStyle: { color: "#f5a9d1" },
          data: xs.map(
            (x) => (clamp(p.upper - x / 100) - clamp(p.lower - x / 100)) * 100,
          ),
          tooltip: { show: false },
        },
        {
          name: "Abstención",
          type: "line",
          symbol: "none",
          itemStyle: { color: "#e5007e" },
          lineStyle: { width: 2 },
          data: xs.map((x) => clamp(p.predicted - x / 100) * 100),
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: "#0d172f", type: "dashed", width: 1 },
            data:
              valid && Math.abs(change) <= 20
                ? [{ xAxis: xs.indexOf(Math.round(change)) }]
                : [],
          },
        },
      ],
    };
  }, [p, change, valid]);
  const expected = valid ? clamp(p.predicted - change / 100) : null;
  return (
    <div className="section-page scenarios-page">
      <PageKpis
        label="Indicadores del escenario"
        items={[
          {
            title: "Abstención base 2027",
            value: pct(p.predicted),
            reference: `Riesgo ${riskLabels[p.risk_level].toLowerCase()}`,
            icon: Target,
            chart: {
              kind: "band",
              lower: p.lower,
              upper: p.upper,
              value: p.predicted,
            },
          },
          {
            title: "Supuesto de participación",
            value: valid ? pp(change) : "—",
            reference: "Respecto a la estimación base",
            icon: SlidersHorizontal,
            chart: {
              kind: "bars",
              values: [
                1 - p.predicted,
                valid ? clamp(1 - p.predicted + change / 100) : 0,
              ],
            },
          },
          {
            title: "Abstención con escenario",
            value: result ? pct(result.scenario.abstention_rate) : "—",
            reference: result
              ? `Riesgo ${riskLabels[result.scenario.risk_level].toLowerCase()}`
              : "Sin calcular",
            icon: Gauge,
            change: result
              ? {
                  value: pp(
                    Number(
                      (
                        (result.scenario.abstention_rate -
                          result.baseline.abstention_rate) *
                        100
                      ).toFixed(2),
                    ),
                  ),
                  label: "vs. base",
                  down:
                    result.scenario.abstention_rate <
                    result.baseline.abstention_rate,
                }
              : undefined,
            chart: result
              ? {
                  kind: "band",
                  lower: result.scenario.abstention_band_lower,
                  upper: result.scenario.abstention_band_upper,
                  value: result.scenario.abstention_rate,
                }
              : undefined,
          },
          {
            title: "Participación con escenario",
            value: result ? pct(result.scenario.participation_rate) : "—",
            reference: result
              ? `Base ${pct(result.baseline.participation_rate)}`
              : `Base ${pct(1 - p.predicted)}`,
            icon: Vote,
            chart: result
              ? {
                  kind: "line",
                  values: [
                    result.baseline.participation_rate,
                    result.scenario.participation_rate,
                  ],
                }
              : undefined,
          },
        ]}
      />
      <div className="scenario-grid">
        <SectionCard
          id="scenario-input-title"
          icon={FlaskConical}
          title="Define tu escenario"
          subtitle={`${p.name} · Elección intermedia 2027`}
          className="scenario-input"
        >
          <form
            className="scenario-form"
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            <label htmlFor="change-input">
              Cambio hipotético en participación
            </label>
            <p id="change-help" className="small muted">
              Puntos porcentuales respecto a la estimación base. Positivo
              aumenta la participación; negativo la reduce.
            </p>
            <div className="scenario-presets" aria-label="Supuestos rápidos">
              {presets.map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={valid && change === value}
                  onClick={() => setInput(String(value))}
                >
                  {value === 0 ? "Sin cambio" : pp(value)}
                </button>
              ))}
            </div>
            <div className="change-input-wrap">
              <input
                id="change-input"
                aria-describedby="change-help change-validation"
                type="number"
                min={-100}
                max={100}
                step="0.5"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <span>pp</span>
            </div>
            <input
              className="scenario-slider"
              aria-label="Ajustar cambio de participación"
              type="range"
              min={-100}
              max={100}
              step="0.5"
              value={valid ? change : 0}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="slider-labels">
              <span>−100 pp</span>
              <span>Sin cambio</span>
              <span>+100 pp</span>
            </div>
            <p
              id="change-validation"
              className={valid ? "small muted" : "small validation-error"}
            >
              {valid
                ? `Supuesto actual: ${pp(change)} de participación · abstención esperada ${pct(expected)}.`
                : "Ingresa un valor entre −100 y +100 pp."}
            </p>
            <div className="scenario-actions">
              <Button type="submit" disabled={!valid || mutation.isPending}>
                <Play size={15} />
                {mutation.isPending ? "Calculando…" : "Calcular escenario"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={mutation.isPending}
              >
                <RotateCcw size={15} />
                Restablecer
              </Button>
            </div>
          </form>
          <p className="section-card-note">
            Simulación aritmética, sin interpretación causal. No predice el
            efecto de campañas, políticas ni intervenciones. Las tasas y bandas
            se limitan a 0–100%.
          </p>
        </SectionCard>
        <SectionCard
          id="scenario-result-title"
          icon={Scale}
          title="Base vs. escenario"
          subtitle={
            result
              ? preview
                ? "Resultado local · no se guarda"
                : "Resultado calculado y guardado por la API"
              : "Ejecuta el escenario para comparar resultados"
          }
          actions={
            result && (
              <span className="saved-label">
                <Check size={14} />
                {preview ? "Calculado localmente" : "Guardado"}
              </span>
            )
          }
          className="scenario-results"
          aria-live="polite"
          aria-busy={mutation.isPending}
        >
          <Status
            loading={mutation.isPending}
            error={mutation.error}
            retry={run}
          />
          {!mutation.isPending && !mutation.error && (
            <>
              <div className="scenario-comparison">
                <div>
                  <span className="section-eyebrow">Base · 2027</span>
                  <ScenarioGauge
                    label="abstención"
                    value={result?.baseline.abstention_rate ?? p.predicted}
                  />
                  <RiskBadge
                    risk={result?.baseline.risk_level ?? p.risk_level}
                  />
                </div>
                <ArrowRight className="comparison-arrow" size={22} />
                <div className={result ? "scenario-active" : ""}>
                  <span className="section-eyebrow">Escenario hipotético</span>
                  <strong className="sr-only">
                    {pct(result?.scenario.abstention_rate)}
                  </strong>
                  <ScenarioGauge
                    label="abstención"
                    value={result?.scenario.abstention_rate ?? null}
                    active={!!result}
                  />
                  {result ? (
                    <RiskBadge risk={result.scenario.risk_level} />
                  ) : (
                    <span className="muted small">Sin calcular</span>
                  )}
                </div>
              </div>
              <table className="section-table">
                <thead>
                  <tr>
                    <th>Indicador</th>
                    <th>Base</th>
                    <th>Escenario</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Participación</td>
                    <td>
                      {pct(
                        result?.baseline.participation_rate ?? 1 - p.predicted,
                      )}
                    </td>
                    <td>{pct(result?.scenario.participation_rate)}</td>
                  </tr>
                  <tr>
                    <td>Banda de abstención</td>
                    <td>
                      {pct(result?.baseline.abstention_band_lower ?? p.lower)} –{" "}
                      {pct(result?.baseline.abstention_band_upper ?? p.upper)}
                    </td>
                    <td>
                      {result
                        ? `${pct(result.scenario.abstention_band_lower)} – ${pct(result.scenario.abstention_band_upper)}`
                        : "—"}
                    </td>
                  </tr>
                  <tr>
                    <td>Cambio aplicado en participación</td>
                    <td>Base</td>
                    <td>{pp(result?.applied_participation_change_pp)}</td>
                  </tr>
                </tbody>
              </table>
              {!result && (
                <div className="scenario-placeholder">
                  {mutation.data
                    ? "Los parámetros cambiaron. Calcula de nuevo para actualizar el resultado."
                    : "El resultado aparecerá aquí al calcular el escenario."}
                </div>
              )}
              {result && (
                <>
                  <Note>
                    {result.point_was_clipped || result.band_was_clipped
                      ? "Se aplicaron límites de 0–100% al punto o a la banda. "
                      : ""}
                    {result.scenario.classification_uncertain
                      ? "La banda del escenario sigue cruzando categorías de riesgo. "
                      : "La categoría es estable dentro de esta banda. "}
                    El desplazamiento supone que la incertidumbre base permanece
                    sin cambios.
                  </Note>
                  <p className="section-card-note simulation-id">
                    {preview
                      ? "Escenario local · no guardado"
                      : "Identificador reproducible"}{" "}
                    <code>{mutation.data!.id}</code>
                  </p>
                </>
              )}
            </>
          )}
        </SectionCard>
      </div>
      <div className="section-grid-2">
        <SectionCard
          id="sensitivity-title"
          icon={ChartSpline}
          title="Sensibilidad de la abstención"
          subtitle={`${p.name} · cambios de −20 a +20 pp sobre la base 2027`}
        >
          <Chart
            option={sensitivity}
            label={`Abstención de ${p.name} para cambios de participación entre −20 y +20 puntos, con banda de referencia desplazada.`}
            height={240}
          />
          <p className="section-card-note">
            Curva aritmética de referencia; el resultado oficial del escenario
            lo calcula la API.
          </p>
        </SectionCard>
        <SectionCard
          id="assumptions-title"
          icon={ListChecks}
          title="Supuestos explícitos"
          subtitle="Lo que el escenario hace y lo que no"
          className="assumptions"
        >
          <ol className="assumption-list">
            <li>
              <span>01</span>
              <div>
                <h3>Una modificación, una identidad</h3>
                <p>
                  Participación + abstención = 100% sobre SV + NV. Cada punto de
                  participación reduce un punto de abstención.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>El territorio conserva su base</h3>
                <p>
                  El escenario usa la corrida {forecast.id}. Solo modifica{" "}
                  {p.name}; no estima una tasa nacional.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>Comparación hipotética</h3>
                <p>
                  La banda se desplaza con el supuesto. NS, composición del
                  electorado y shocks electorales no se modelan como efectos de
                  la intervención.
                </p>
              </div>
            </li>
          </ol>
        </SectionCard>
      </div>
    </div>
  );
}
