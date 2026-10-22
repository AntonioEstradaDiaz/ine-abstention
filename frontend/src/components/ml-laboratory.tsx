"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BrainCircuit,
  Download,
  FlaskConical,
  Play,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import type { MLLaboratory } from "@/lib/ml-types";
import { mlScenario } from "@/lib/ml-scenario";
import { pct, pp } from "@/lib/utils";
import { Chart, chartAxis, chartTooltip } from "./chart";
import { Button } from "./ui/button";
import { Note, RiskBadge, Status } from "./shared";

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function MLLaboratoryView({ selected }: { selected: string }) {
  const query = useQuery({
    queryKey: ["ml-laboratory"],
    queryFn: ({ signal }) => api.laboratory(signal),
  });
  if (!query.data)
    return (
      <Status
        loading={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      />
    );
  return (
    <Laboratory
      key={`${query.data.run_id}-${selected}`}
      report={query.data}
      selected={selected}
    />
  );
}

function Laboratory({
  report,
  selected,
}: {
  report: MLLaboratory;
  selected: string;
}) {
  const [modelName, setModelName] = useState(
    report.protocol.preferred_ml_model,
  );
  const [input, setInput] = useState("3");
  const [calculated, setCalculated] = useState<{
    model: string;
    change: number;
    result: ReturnType<typeof mlScenario>;
  } | null>(null);
  const model = report.models.find((m) => m.name === modelName)!;
  const forecast = model.forecasts.find((f) => f.state_code === selected);
  const reference = report.models.find(
    (m) => m.name === report.protocol.selected_model,
  )!;
  const delta = Number(input),
    valid =
      input.trim() !== "" && Number.isFinite(delta) && Math.abs(delta) <= 20;
  const result =
    valid && calculated?.model === modelName && calculated.change === delta
      ? calculated.result
      : null;
  const option = useMemo(
    () => ({
      tooltip: {
        ...chartTooltip,
        trigger: "item",
        formatter: (p: { name: string; value: number }) =>
          `${p.name}: ${p.value.toFixed(1)}%`,
      },
      grid: { left: 15, right: 45, top: 10, bottom: 25, containLabel: true },
      xAxis: {
        ...chartAxis,
        type: "value",
        min: 0,
        max: 100,
        axisLabel: { color: "#596D8D", formatter: "{value}%" },
      },
      yAxis: {
        ...chartAxis,
        type: "category",
        inverse: true,
        data: report.models.map((m) => m.label),
        axisLabel: { color: "#475B76", width: 145, overflow: "truncate" },
        splitLine: { show: false },
      },
      series: [
        {
          type: "bar",
          barMaxWidth: 19,
          data: report.models.map((m) => ({
            value:
              (m.forecasts.find((f) => f.state_code === selected)?.predicted ??
                0) * 100,
            itemStyle: {
              color: m.name === modelName ? "#C4006B" : "#3C526F",
              borderRadius: [0, 4, 4, 0],
            },
          })),
          label: {
            show: true,
            position: "right",
            color: "#34445D",
            formatter: (p: { value: number }) => `${p.value.toFixed(1)}%`,
          },
        },
      ],
    }),
    [report, selected, modelName],
  );
  if (!forecast) return <Status empty />;
  const improvement = reference.holdout_mae_pp - model.holdout_mae_pp;
  const exportForecasts = () => {
    const columns = [
      "corrida,modelo,estado,clave,objetivo,abstencion_estimada,banda_inferior,banda_superior,riesgo,MAE_2024_pp",
    ];
    for (const f of model.forecasts)
      columns.push(
        [
          report.run_id,
          model.name,
          `"${f.name.replaceAll('"', '""')}"`,
          f.state_code,
          report.target_year,
          f.predicted,
          f.lower,
          f.upper,
          f.risk_level,
          model.holdout_mae_pp,
        ].join(","),
      );
    download(
      "\uFEFF" + columns.join("\r\n"),
      `pulso-ml-${model.name}-${report.target_year}.csv`,
      "text/csv;charset=utf-8",
    );
  };
  const exportScenario = () => {
    if (!result) return;
    download(
      JSON.stringify(
        {
          run_id: report.run_id,
          model: model.name,
          state_code: selected,
          target_year: report.target_year,
          source_sha256: report.data.source_sha256,
          base: forecast,
          participation_change_pp: delta,
          result,
          persisted: false,
          interpretation:
            "Sensibilidad aritmética sobre un pronóstico ML; no estima efectos causales ni reentrena el modelo.",
        },
        null,
        2,
      ),
      `escenario-ml-${model.name}-${selected}.json`,
      "application/json",
    );
  };
  return (
    <div className="ml-laboratory">
      <section className="ml-intro panel">
        <div className="ml-intro-icon">
          <BrainCircuit size={28} />
        </div>
        <div>
          <span className="eyebrow">APRENDIZAJE AUTOMÁTICO · EXPERIMENTAL</span>
          <h2>De los datos a los escenarios</h2>
          <p>
            Cuatro modelos entrenados y dos referencias históricas. Explora sus
            diferencias, su error real y las variables que utilizan.
          </p>
        </div>
        <span className="tag-purple">Entrenamiento local</span>
      </section>
      <Note>
        La selección con 2018/2021 conserva «{reference.label}» como referencia.
        El laboratorio muestra alternativas experimentales; un menor error en
        2024 no cambia retrospectivamente esa selección. La prueba 2024 es
        presidencial; el objetivo 2027 es intermedio.
      </Note>
      <div className="ml-toolbar">
        <label>
          Modelo para explorar
          <select
            aria-label="Modelo de machine learning"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
          >
            {report.models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.label}
                {m.preferred_ml
                  ? " · mejor ML en desarrollo"
                  : m.selected_on_development
                    ? " · referencia elegida"
                    : ""}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" onClick={exportForecasts}>
          <Download size={15} /> Exportar 32 pronósticos
        </Button>
      </div>
      <div className="kpi-grid ml-kpis">
        <div className="kpi">
          <div className="kpi-label">
            {forecast.name}
            <span>{report.target_year}</span>
          </div>
          <strong className="purple-text">{pct(forecast.predicted)}</strong>
          <div className="kpi-description">
            Abstención estimada · {model.label}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            Error absoluto medio<span>2024</span>
          </div>
          <strong>{pp(model.holdout_mae_pp).replace("+", "")}</strong>
          <div className="kpi-description">
            Prueba temporal · 32 estados · menor es mejor
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            Aprendizaje real
            <span>
              {report.data.years[0]}–{report.as_of_year}
            </span>
          </div>
          <strong>
            {report.data.supervised_rows}
            <small> ejemplos</small>
          </strong>
          <div className="kpi-description">
            {report.data.rows} registros históricos · {report.data.state_count}{" "}
            estados
          </div>
        </div>
      </div>
      <div className="ml-two-columns">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Una entidad, seis estimaciones</h2>
              <p>
                {forecast.name} · Abstención estimada {report.target_year}
              </p>
            </div>
          </div>
          <Chart
            option={option}
            height={290}
            label={`Pronóstico ${report.target_year} de seis modelos para ${forecast.name}. Valores exactos en la comparación de modelos.`}
          />
          <div className="panel-note">
            <Note>
              Las barras son estimaciones puntuales. La banda del modelo
              seleccionado es {pct(forecast.lower)}–{pct(forecast.upper)}; no
              garantiza cobertura futura.
            </Note>
          </div>
        </section>
        <section className="panel ml-reading">
          <span className="eyebrow">LECTURA AUTOMÁTICA DE LOS DATOS</span>
          <h2>{forecast.name}</h2>
          <RiskBadge risk={forecast.risk_level} />
          <ul>
            <li>
              {model.label} estima {pct(forecast.predicted)} de abstención,{" "}
              {pp(forecast.delta_vs_baseline_pp)} frente a repetir la intermedia
              de 2021.
            </li>
            <li>
              La última intermedia registró{" "}
              {pct(Number(forecast.features.previous_abstention_rate))}. La
              media de sus {forecast.features.same_type_history_count}{" "}
              elecciones comparables es{" "}
              {pct(Number(forecast.features.historical_mean_abstention))}.
            </li>
            <li>
              En la evaluación de 32 estados de 2024, el error medio del modelo
              fue {pp(Math.abs(improvement)).replace("+", "")}{" "}
              {improvement > 0
                ? "menor"
                : improvement < 0
                  ? "mayor"
                  : "de diferencia"}{" "}
              que el de la referencia. Ese resultado no es una precisión
              garantizada para 2027.
            </li>
            <li>
              {forecast.uncertainty.classification_uncertain
                ? "La banda cruza categorías de riesgo; el semáforo es incierto."
                : "La banda permanece dentro de una categoría de riesgo."}{" "}
              Los datos NS pueden sesgar las tasas observadas.
            </li>
          </ul>
          <p className="small muted">
            Síntesis calculada con las tasas y métricas de esta corrida; sin
            afirmaciones causales.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Comparación de modelos entrenados</h2>
            <p>
              Desarrollo: 2018/2021 · Prueba reservada: 2024 · Errores en puntos
              porcentuales
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="ml-model-table">
            <caption className="sr-only">
              Modelos, errores temporales y pronóstico de {forecast.name}
            </caption>
            <thead>
              <tr>
                <th>Modelo</th>
                <th>MAE desarrollo</th>
                <th>MAE 2024</th>
                <th>Estimación 2027</th>
                <th>Explorar</th>
              </tr>
            </thead>
            <tbody>
              {report.models.map((m) => (
                <tr
                  key={m.name}
                  className={m.name === modelName ? "selected-row" : ""}
                >
                  <td>
                    <strong>{m.label}</strong>
                    <small>
                      {m.selected_on_development
                        ? "Referencia elegida en desarrollo"
                        : m.preferred_ml
                          ? "Mejor candidato ML en desarrollo"
                          : m.kind === "ml"
                            ? "Candidato experimental"
                            : "Referencia histórica"}
                    </small>
                  </td>
                  <td>{pp(m.development_mae_pp).replace("+", "")}</td>
                  <td>{pp(m.holdout_mae_pp).replace("+", "")}</td>
                  <td>
                    {pct(
                      m.forecasts.find((f) => f.state_code === selected)
                        ?.predicted,
                    )}
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant={m.name === modelName ? "default" : "outline"}
                      aria-label={`Explorar ${m.label}`}
                      aria-pressed={m.name === modelName}
                      onClick={() => setModelName(m.name)}
                    >
                      {m.name === modelName ? "Activo" : "Explorar"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="ml-two-columns">
        <section className="panel ml-importance">
          <div className="panel-heading">
            <div>
              <h2>Qué aprendió el modelo</h2>
              <p>Importancia interna global · {model.label}</p>
            </div>
          </div>
          {model.important_features.length ? (
            <ol>
              {model.important_features.slice(0, 5).map((f) => (
                <li key={f.feature}>
                  <div>
                    <span>{f.label}</span>
                    <strong>{pct(f.weight)}</strong>
                  </div>
                  <progress
                    max={1}
                    value={f.weight}
                    aria-label={`Importancia global: ${f.label}`}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <div className="ml-empty-explanation">
              Ridge combina variables históricas mediante una regresión
              regularizada. No se presenta una importancia de árboles para este
              estimador.
            </div>
          )}
          <div className="panel-note">
            <Note>
              {model.kind === "baseline"
                ? "En las referencias la variable indicada constituye la fórmula completa."
                : "La importancia resume el uso de variables dentro del modelo entrenado; no explica una persona ni mide el efecto de cambiar una variable. Las medidas varían entre algoritmos."}
            </Note>
          </div>
        </section>
        <section className="panel ml-sensitivity">
          <div className="panel-heading">
            <div>
              <h2>Escenario sobre el pronóstico ML</h2>
              <p>
                {model.label} · {forecast.name}
              </p>
            </div>
            <FlaskConical size={20} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (valid)
                setCalculated({
                  model: modelName,
                  change: delta,
                  result: mlScenario(forecast, model, delta),
                });
            }}
          >
            <label htmlFor="ml-change">
              Cambio supuesto de participación (pp)
            </label>
            <input
              id="ml-change"
              type="number"
              step="0.5"
              min={-20}
              max={20}
              value={input}
              aria-describedby="ml-change-help"
              onChange={(e) => setInput(e.target.value)}
            />
            <input
              type="range"
              aria-label="Ajuste del escenario ML"
              min={-20}
              max={20}
              step="0.5"
              value={valid ? delta : 0}
              onChange={(e) => setInput(e.target.value)}
            />
            <p id="ml-change-help" className="small muted">
              De −20 a +20 pp. Positivo aumenta participación y reduce
              abstención. Es un supuesto, no el efecto estimado de una
              intervención.
            </p>
            <div className="ml-actions">
              <Button type="submit" disabled={!valid}>
                <Play size={14} /> Calcular escenario ML
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setInput("0");
                  setCalculated(null);
                }}
              >
                <RotateCcw size={14} /> Reiniciar
              </Button>
            </div>
          </form>
          <div className="ml-scenario-result" aria-live="polite">
            {result ? (
              <>
                <div>
                  <span>Base ML</span>
                  <strong>{pct(forecast.predicted)}</strong>
                </div>
                <div>
                  <span>Escenario</span>
                  <strong className="purple-text">
                    {pct(result.predicted)}
                  </strong>
                </div>
                <RiskBadge risk={result.risk_level} />
                <p>
                  Banda: {pct(result.lower)}–{pct(result.upper)} · Cambio
                  aplicado: {pp(result.applied_change_pp)}.
                </p>
                <p>
                  {result.clipped ? "Se aplicaron límites de 0–100%. " : ""}
                  {result.classification_uncertain
                    ? "La banda cruza categorías de riesgo. "
                    : ""}
                  Resultado local, no guardado. La banda se desplaza; el modelo
                  no se reentrena.
                </p>
                <Button variant="outline" size="sm" onClick={exportScenario}>
                  <Download size={14} /> Exportar escenario JSON
                </Button>
              </>
            ) : (
              <p>
                {calculated
                  ? "Cambiaste el modelo o el supuesto. Calcula otra vez para actualizar el resultado."
                  : "Calcula para comparar el pronóstico aprendido con tu escenario."}
              </p>
            )}
          </div>
        </section>
      </div>
      <details className="panel ml-methodology">
        <summary>Validación, datos y límites del análisis</summary>
        <p>
          Entrenado con la muestra estatal del repositorio. No hay desgloses
          demográficos disponibles en esta corrida. Cada elección de prueba
          queda completamente fuera de su entrenamiento; los pronósticos 2027
          usan el ajuste final con datos hasta {report.as_of_year}.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Elección de prueba</th>
                <th>Elecciones objetivo de entrenamiento</th>
                <th>Ejemplos de entrenamiento</th>
                <th>Estados evaluados</th>
              </tr>
            </thead>
            <tbody>
              {report.folds.map((f) => (
                <tr key={f.test_year}>
                  <td>{f.test_year}</td>
                  <td>{f.train_target_years.join(", ")}</td>
                  <td>{f.train_rows}</td>
                  <td>{f.test_rows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul>
          {report.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="small muted">
          Corrida: <code>{report.run_id}</code> · Datos:{" "}
          <code>{report.data.source}</code>
          <br />
          SHA-256: <code>{report.data.source_sha256}</code>
        </p>
      </details>
    </div>
  );
}
