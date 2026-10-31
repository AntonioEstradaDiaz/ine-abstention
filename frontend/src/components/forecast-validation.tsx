import { AlertTriangle, CalendarClock, Database, FlaskConical, ShieldAlert } from "lucide-react";
import type { Forecast, Prediction, Indicator } from "@/lib/types";
import { matchesForecastAudit } from "@/lib/forecast-audit-match";
import { evaluateHistoricalReference } from "@/lib/live-forecast-validation";
import audit from "@/lib/forecast-validation.json";

const format = (n: number) => new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(n);

export function ForecastValidation({
  forecast, prediction, history = [],
}: { forecast: Forecast; prediction: Prediction; history?: Indicator[] }) {
  const live = evaluateHistoricalReference(history, prediction.state_code, forecast.election_type, forecast.as_of_year);
  const aligned = matchesForecastAudit(forecast, audit);
  const state = audit.state_diagnostics.find((x) => x.state_code === prediction.state_code);
  const midterm = audit.by_year.find((x) => x.year === 2021);
  const holdout = audit.by_year.find((x) => x.year === 2024);
  return (
    <section className="section-card forecast-validation" aria-labelledby="validation-audit-title">
      <header className="validation-heading">
        <span className="validation-icon"><FlaskConical size={23} aria-hidden="true" /></span>
        <div>
          <span className="validation-eyebrow">Evaluación del modelo · Punto 6</span>
          <h2 id="validation-audit-title">¿Qué tan validada está esta predicción?</h2>
          <p>Auditoría histórica, registros NS y límites de incertidumbre.</p>
        </div>
        <span className="validation-experimental">Experimental</span>
      </header>
      {aligned && state && midterm && holdout ? (
        <>
          <div className="validation-metrics">
            {[
              {
                icon: CalendarClock, label: "MAE 2021 · intermedia",
                value: midterm.mae_pp, unit: "pp",
                detail: "Bloque de desarrollo comparable con 2027.",
              },
              {
                icon: Database, label: "MAE 2024 · prueba final",
                value: holdout.mae_pp, unit: "pp",
                detail: "Corte reservado, pero elección presidencial.",
              },
              {
                icon: ShieldAlert, label: "Radio empírico de 2027",
                value: audit.calibration.reference_radius_pp, unit: "pp",
                detail: "Un bloque electoral; sin cobertura garantizada.",
              },
            ].map((item) => (
              <div className="validation-metric" key={item.label}>
                <item.icon aria-hidden="true" size={19} />
                <span>{item.label}</span>
                <strong>{format(item.value)} <small>{item.unit}</small></strong>
                <p>{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="validation-details">
            <div>
              <h3>Errores históricos · {prediction.name}</h3>
              <p>2021 (intermedia): <strong>{format(state.mae_2021_midterm_pp)} pp</strong></p>
              <p>2024 (presidencial): <strong>{format(state.error_2024_presidential_pp)} pp</strong></p>
              <small>Son errores anteriores, no una estimación del error de 2027.</small>
            </div>
            <div>
              <h3>Sensibilidad a NS · 2024</h3>
              <p>Sin especificar: <strong>{format(state.ns_2024_pct)}%</strong></p>
              <p>Abstención hipotética: <strong>{format(state.illustrative_ns_lower_2024_pct)}–{format(state.illustrative_ns_upper_2024_pct)}%</strong></p>
              <small>Asignación extrema hipotética de NS: no es una banda predictiva.</small>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="validation-warning" role="note">
            Evaluación histórica de referencia · {prediction.name}. Se reproduce el método de última elección comparable con los datos cargados. No sustituye la auditoría de la corrida actual.
          </div>
          {"error" in live ? <p role="status">{live.error}</p> : <>
            <div className="validation-metrics">
              <div className="validation-metric"><CalendarClock aria-hidden="true" /><span>Error absoluto medio · referencia</span><strong>{live.mae == null ? "Datos insuficientes" : `${format(live.mae)} pp`}</strong><p>{live.folds.length} comparaciones temporales; cada estimación utiliza exclusivamente la elección anterior del mismo tipo.</p></div>
              <div className="validation-metric"><Database aria-hidden="true" /><span>Histórico comparable</span><strong>{live.rows.length} elecciones</strong><p>{live.rows.map(r=>r.year).join(" · ")} · Corte {forecast.as_of_year}</p></div>
              <div className="validation-metric"><ShieldAlert aria-hidden="true" /><span>Registros sin participación especificada · {live.latest.year}</span><strong>{live.sensitivity ? `${format(live.sensitivity.unspecified)}%` : "No disponible"}</strong><p>No indican abstención confirmada; se excluyen de SV + NV.</p></div>
            </div>
            <div className="validation-details">
              <div><h3>Comprobación temporal · {forecast.election_type === "midterm" ? "Intermedias" : "Presidenciales"}</h3>
                {live.folds.map(f=><p key={f.year}>{f.referenceYear} → {f.year}: estimado <strong>{format(f.estimated)}%</strong>, observado <strong>{format(f.observed)}%</strong>; error <strong>{format(f.error)} pp</strong> · Fuente {f.sourceId}</p>)}
                {!live.folds.length && <p>Se necesitan al menos dos elecciones del mismo tipo para medir un error histórico.</p>}
                <small>Evaluación retrospectiva sobre la versión disponible de los datos; no mide el error futuro de {forecast.target_year}.</small>
              </div>
              <div><h3>Sensibilidad a NS · {live.latest.year}</h3>
                <p>SV: {live.latest.voter_count.toLocaleString("es-MX")} · NV: {live.latest.nonvoter_count.toLocaleString("es-MX")}</p>
                {live.sensitivity ? <p>Si todos los registros sin especificar fueran votantes o no votantes, la abstención sería <strong>{format(live.sensitivity.lower)}%–{format(live.sensitivity.upper)}%</strong>.</p> : <p>No hay conteos válidos de registros sin especificar para calcular esta sensibilidad.</p>}
                <small>Son supuestos extremos; no es una banda predictiva. Fuente INE CCPC {live.latest.source_id}.</small>
              </div>
            </div>
          </>}
        </>
      )}
      <div className="validation-warning" role="note">
        <AlertTriangle size={19} aria-hidden="true" />
        <p>
          <strong>Validación externa pendiente.</strong> No se han contrastado resultados
          posteriores a 2024 ni versiones originales de publicación por corte.
          Los 32 estados de una elección no son 32 elecciones independientes.
          Estas estimaciones no se han validado para uso operativo.
        </p>
      </div>
      <p className="validation-source">
        {aligned ? `Auditoría ${audit.version} · Entrenamiento ${audit.training_run_id}` : `Referencia recalculada · ${prediction.name} · Corte ${forecast.as_of_year}`} ·
        {forecast.provenance.model_run_id === "preview-csv"
          ? " Vista previa congelada" : " Evidencia de corrida histórica"}
      </p>
    </section>
  );
}
