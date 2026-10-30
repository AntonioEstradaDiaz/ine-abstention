"use client";
import { useMemo, useState } from "react";
import { Download, Info, Scale, X } from "lucide-react";
import type { Forecast, Prediction } from "@/lib/types";
import { pct, pp, riskLabels } from "@/lib/utils";
import { compareStateScenarios, comparisonCsv } from "@/lib/scenario-comparison";
import { Button } from "./ui/button";

export function MultiStateComparison({
  states, forecast, primary,
}: {
  states: Prediction[];
  forecast: Forecast;
  primary: Prediction;
}) {
  const [codes, setCodes] = useState<string[]>(() => [
    primary.state_code,
    states.find((state) => state.state_code !== primary.state_code)?.state_code ?? primary.state_code,
  ].filter((code, index, arr) => arr.indexOf(code) === index));
  const [input, setInput] = useState("3");
  const change = input.trim() === "" ? NaN : Number(input);
  const valid = Number.isFinite(change) && change >= -20 && change <= 20;
  const remaining = states.filter((item) => !codes.includes(item.state_code));
  const comparison = useMemo(() => {
    if (!valid || codes.length < 2) return [];
    try { return compareStateScenarios(states, codes, change, forecast); }
    catch { return []; }
  }, [states, codes, change, valid, forecast]);
  function download() {
    if (!comparison.length) return;
    const blob = new Blob([comparisonCsv(comparison, forecast)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atlas-participacion-comparativo-escenarios-${forecast.target_year}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  return (
    <section className="section-page multi-compare-section" aria-labelledby="multi-compare-title">
      <div className="section-card multi-compare-card">
        <header className="multi-compare-header">
          <div className="multi-compare-icon"><Scale size={23} aria-hidden="true" /></div>
          <div>
            <p className="multi-compare-overline">Análisis comparativo · Punto 7</p>
            <h2 id="multi-compare-title">Comparar escenarios entre varios estados</h2>
            <p>Selecciona de dos a seis entidades y aplica el mismo supuesto para evaluar diferencias simultáneas.</p>
          </div>
        </header>
        <div className="multi-compare-controls">
          <label>
            <span>Agregar entidad</span>
            <select
              value=""
              aria-label="Agregar entidad al comparativo"
              disabled={codes.length >= 6}
              onChange={(event) => {
                if (event.target.value && !codes.includes(event.target.value) && codes.length < 6)
                  setCodes((previous) => [...previous, event.target.value]);
              }}
            >
              <option value="">Selecciona un estado…</option>
              {remaining.map((item) => (
                <option key={item.state_code} value={item.state_code}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Cambio de participación (pp)</span>
            <input
              type="number" min="-20" max="20" step="0.1" value={input}
              aria-label="Cambio de participación para comparar estados"
              aria-invalid={!valid}
              aria-describedby="multi-compare-help"
              onChange={(event) => setInput(event.target.value)}
            />
          </label>
          <Button variant="outline" disabled={!comparison.length} onClick={download}>
            <Download size={16} aria-hidden="true" /> Descargar CSV
          </Button>
        </div>
        <p id="multi-compare-help" className="multi-compare-help">
          +3 pp de participación supone −3 pp de abstención, sin inferir efectos causales.
        </p>
        <div className="multi-compare-tags" aria-label="Entidades en la comparación">
          {codes.map((code) => {
            const state = states.find((row) => row.state_code === code);
            return (
              <span className="multi-compare-tag" key={code}>
                {state?.name ?? code}
                <button type="button"
                  aria-label={`Quitar ${state?.name ?? code} de la comparación`}
                  disabled={codes.length <= 2}
                  onClick={() => setCodes((prev) => prev.filter((item) => item !== code))}>
                  <X size={14} aria-hidden="true" />
                </button>
              </span>
            );
          })}
        </div>
        {!valid && <p className="multi-compare-error" role="alert">Introduce un cambio entre −20 y +20 puntos porcentuales.</p>}
        {comparison.length > 0 ? (
          <div className="multi-compare-scroll">
            <table className="section-table multi-compare-table">
              <caption>Escenarios comparados para {forecast.target_year} · Corrida {forecast.id}</caption>
              <thead><tr>
                <th scope="col">Entidad</th><th scope="col">Abstención base</th>
                <th scope="col">Escenario</th><th scope="col">Cambio aplicado</th>
                <th scope="col">Riesgo base</th><th scope="col">Riesgo escenario</th>
              </tr></thead>
              <tbody>{comparison.map((row) => (
                <tr key={row.state_code}>
                  <th scope="row">{row.name}</th>
                  <td>{pct(row.baseline)}</td>
                  <td><strong>{pct(row.scenario)}</strong></td>
                  <td>{pp(row.appliedPP)}</td>
                  <td>{riskLabels[row.riskBefore]}</td>
                  <td>{riskLabels[row.riskAfter]}{row.clipped ? " · Recortado 0–100%" : ""}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p role="status">Selecciona dos estados y un cambio válido para comparar.</p>}
        <p className="multi-compare-disclaimer"><Info size={17} aria-hidden="true" />
          Comparación exploratoria calculada localmente a partir de las predicciones
          estatales y los umbrales del modelo. No se guarda en el historial privado,
          no es causal y no estima una tasa nacional.
        </p>
      </div>
    </section>
  );
}
