"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, FlaskConical, RotateCcw, Play, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { Forecast, Prediction } from "@/lib/types";
import { pct, pp } from "@/lib/utils";
import { Button } from "./ui/button";
import { Note, RiskBadge, Status } from "./shared";

export function Scenarios({
  prediction,
  forecast,
  loading,
  error,
  retry,
}: {
  prediction?: Prediction;
  forecast?: Forecast;
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
      key={`${prediction.state_code}-${forecast.id}`}
      prediction={prediction}
      forecast={forecast}
    />
  );
}
function ScenarioForm({
  prediction: p,
  forecast,
}: {
  prediction: Prediction;
  forecast: Forecast;
}) {
  const [input, setInput] = useState("3");
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
  const reset = () => {
    setInput("0");
    mutation.reset();
  };
  return (
    <>
      <div className="scenario-grid">
        <section className="panel scenario-input">
          <div className="panel-heading">
            <div>
              <h2>Define tu escenario</h2>
              <p>{p.name} · Elección intermedia 2027</p>
            </div>
            <FlaskConical size={21} className="purple-text" />
          </div>
          <form
            className="scenario-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && !mutation.isPending)
                mutation.mutate({
                  code: p.state_code,
                  delta: change,
                  run: forecast.id,
                });
            }}
          >
            <label htmlFor="change-input">
              Cambio hipotético en participación
            </label>
            <p id="change-help" className="small muted">
              Puntos porcentuales respecto a la estimación base. Positivo
              aumenta la participación; negativo la reduce.
            </p>
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
                ? `Supuesto actual: ${pp(change)} de participación.`
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
          <div className="panel-note">
            <Note>
              Simulación aritmética, sin interpretación causal. No predice el
              efecto de campañas, políticas ni intervenciones. Las tasas y
              bandas se limitan a 0–100%.
            </Note>
          </div>
        </section>
        <section
          className="panel scenario-results"
          aria-live="polite"
          aria-busy={mutation.isPending}
        >
          <div className="panel-heading">
            <div>
              <h2>Base vs. escenario</h2>
              <p>
                {result
                  ? forecast.provenance.mode === "preview"
                    ? "Resultado local · no se guarda"
                    : "Resultado calculado y guardado por la API"
                  : "Ejecuta el escenario para comparar resultados"}
              </p>
            </div>
            {result && (
              <span className="saved-label">
                <Check size={14} />
                {forecast.provenance.mode === "preview"
                  ? "Calculado localmente"
                  : "Guardado"}
              </span>
            )}
          </div>
          <Status
            loading={mutation.isPending}
            error={mutation.error}
            retry={() => {
              if (valid)
                mutation.mutate({
                  code: p.state_code,
                  delta: change,
                  run: forecast.id,
                });
            }}
          />
          {!mutation.isPending && !mutation.error && (
            <>
              <div className="scenario-comparison">
                <div>
                  <span className="eyebrow">BASE · 2027</span>
                  <strong>
                    {pct(result?.baseline.abstention_rate ?? p.predicted)}
                  </strong>
                  <span className="muted small">abstención</span>
                  <RiskBadge
                    risk={result?.baseline.risk_level ?? p.risk_level}
                  />
                </div>
                <ArrowRight className="comparison-arrow" size={22} />
                <div className={result ? "scenario-active" : ""}>
                  <span className="eyebrow">ESCENARIO HIPOTÉTICO</span>
                  <strong>{pct(result?.scenario.abstention_rate)}</strong>
                  <span className="muted small">abstención</span>
                  {result ? (
                    <RiskBadge risk={result.scenario.risk_level} />
                  ) : (
                    <span className="muted small">Sin calcular</span>
                  )}
                </div>
              </div>
              <div className="scenario-result-table">
                <div>
                  <span>Participación</span>
                  <strong>
                    {pct(
                      result?.baseline.participation_rate ?? 1 - p.predicted,
                    )}
                  </strong>
                  <strong>{pct(result?.scenario.participation_rate)}</strong>
                </div>
                <div>
                  <span>Banda de abstención</span>
                  <strong>
                    {pct(result?.baseline.abstention_band_lower ?? p.lower)} –{" "}
                    {pct(result?.baseline.abstention_band_upper ?? p.upper)}
                  </strong>
                  <strong>
                    {result
                      ? `${pct(result.scenario.abstention_band_lower)} – ${pct(result.scenario.abstention_band_upper)}`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Cambio aplicado en participación</span>
                  <span>Base</span>
                  <strong>{pp(result?.applied_participation_change_pp)}</strong>
                </div>
              </div>
              {!result && (
                <div className="scenario-placeholder">
                  {mutation.data
                    ? "Los parámetros cambiaron. Calcula de nuevo para actualizar el resultado."
                    : "El resultado aparecerá aquí al calcular el escenario."}
                </div>
              )}
              {result && (
                <div className="panel-note">
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
                  <p className="small muted simulation-id">
                    {forecast.provenance.mode === "preview"
                      ? "Escenario local · no guardado"
                      : "Identificador reproducible"}
                    <br />
                    <code>{mutation.data!.id}</code>
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <section className="panel assumptions">
        <h2>Supuestos explícitos</h2>
        <div className="assumption-grid">
          <div>
            <span>01</span>
            <h3>Una modificación, una identidad</h3>
            <p>
              Participación + abstención = 100% sobre SV + NV. Cada punto de
              participación reduce un punto de abstención.
            </p>
          </div>
          <div>
            <span>02</span>
            <h3>El territorio conserva su base</h3>
            <p>
              El escenario usa la corrida {forecast.id}. Solo modifica {p.name};
              no estima una tasa nacional.
            </p>
          </div>
          <div>
            <span>03</span>
            <h3>Comparación hipotética</h3>
            <p>
              La banda se desplaza con el supuesto. NS, composición del
              electorado y shocks electorales no se modelan como efectos de la
              intervención.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
