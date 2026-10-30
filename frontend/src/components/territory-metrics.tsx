"use client";
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  History,
  ChartNoAxesCombined,
  Users,
  TrendingUp,
  CircleHelp,
  ShieldCheck,
  Database,
} from "lucide-react";
import { analysisRates } from "@/lib/analysis";
import { api } from "@/lib/api";
import type { Indicator, Prediction, Source } from "@/lib/types";
import { number, pct, pp } from "@/lib/utils";
import { RiskBadge, Status } from "./shared";

const tabs = ["Resumen", "Histórico", "Factores", "Recomendaciones"] as const;
type Tab = (typeof tabs)[number];
export function TerritoryMetrics({
  prediction: p,
  actual,
  selected,
  year,
  loading,
  error,
  retry,
}: {
  prediction?: Prediction;
  actual?: Indicator;
  selected: string;
  year: number;
  loading: boolean;
  error: Error | null;
  retry: () => void;
  sources?: Source[];
  onExplore: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Resumen");
  const id = useId();
  const [historyType, setHistoryType] = useState<"midterm" | "presidential">(
    "midterm",
  );
  const history = useQuery({
    queryKey: ["history", selected],
    queryFn: ({ signal }) => api.history(selected, signal),
    enabled: !!selected,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const records = (history.data?.items ?? [])
    .slice()
    .sort((a, b) => a.year - b.year);
  const comparable = records.filter(
    (record) => record.election_type === historyType,
  );
  const latest = comparable.at(-1);
  const prior = comparable.at(-2);
  const historicalChange =
    latest?.participation_rate != null && prior?.participation_rate != null
      ? (latest.participation_rate - prior.participation_rate) * 100
      : null;
  const current = records.find((r) => r.year === year);
  const previous = current
    ? records
        .filter(
          (r) => r.year < year && r.election_type === current.election_type,
        )
        .at(-1)
    : undefined;
  const delta =
    actual?.participation_rate != null && previous?.participation_rate != null
      ? (actual.participation_rate - previous.participation_rate) * 100
      : null;
  const observed =
    actual?.year === year &&
    (actual.state_code || actual.official_code) === selected
      ? actual
      : undefined;
  const rates = analysisRates(observed);
  const value = rates?.abstention;
  const observedLabel = year > 0 ? `Abstención observada · ${observed?.year ?? year}` : "Sin proceso disponible";
  const safe = value == null ? 0 : Math.min(1, Math.max(0, value));
  const context = p?.explanation.context_only;
  const name = (observed?.name ?? p?.name)
    ?.toLocaleLowerCase("es-MX")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-MX"));
  const rows = [
    {
      label: "Media histórica de abstención",
      value: context?.historical_mean_abstention,
      display: pct(context?.historical_mean_abstention),
      icon: History,
    },
    {
      label: `Última intermedia · ${p?.explanation.reference_year ?? "—"}`,
      value: p?.predicted,
      display: pct(p?.predicted),
      icon: ChartNoAxesCombined,
    },
    {
      label: `Participación no especificada · ${year}`,
      value: actual?.unspecified_rate,
      display: pct(actual?.unspecified_rate),
      icon: Users,
    },
    {
      label: "Brecha nacional anterior",
      value:
        context?.previous_gap_vs_national_pp == null
          ? null
          : Math.abs(context.previous_gap_vs_national_pp) / 100,
      display: pp(context?.previous_gap_vs_national_pp),
      icon: CircleHelp,
    },
    {
      label: "Tendencia de abstención / año",
      value:
        context?.abstention_trend_pp_per_year == null
          ? null
          : Math.abs(context.abstention_trend_pp_per_year) / 100,
      display: pp(context?.abstention_trend_pp_per_year),
      icon: TrendingUp,
    },
  ];
  const contextRows = (
    <div className="territory-context-rows">
      {rows.map(({ label, value, display, icon: Icon }) => (
        <div key={label}>
          <Icon size={13} />
          <span>{label}</span>
          <span className="territory-context-track" aria-hidden="true">
            <span
              style={{
                width: `${value == null ? 0 : Math.min(1, Math.max(0, value)) * 100}%`,
              }}
            />
          </span>
          <strong>{display}</strong>
        </div>
      ))}
    </div>
  );
  return (
    <aside
      className="panel territory-metrics territory-detail"
      aria-label="Detalle del territorio"
      data-territory-code={selected}
    >
      <header className="territory-metrics-heading">
        <span className="territory-location">
          <MapPin size={18} />
        </span>
        <div>
          <h2>{name ?? "Selecciona un estado"}</h2>
          <p>Entidad federativa · México</p>
        </div>
        {p && <RiskBadge risk={p.risk_level} />}
      </header>
      <div
        className="territory-metrics-tabs"
        role="tablist"
        aria-label="Información del territorio"
      >
        {tabs.map((label, i) => (
          <button
            type="button"
            key={label}
            id={`${id}-tab-${i}`}
            role="tab"
            aria-selected={tab === label}
            aria-controls={`${id}-panel`}
            tabIndex={tab === label ? 0 : -1}
            onClick={() => setTab(label)}
            onKeyDown={(event) => {
              const keys = {
                ArrowRight: 1,
                ArrowLeft: -1,
                Home: -i,
                End: tabs.length - 1 - i,
              };
              if (event.key in keys) {
                event.preventDefault();
                const next =
                  (i + keys[event.key as keyof typeof keys] + tabs.length) %
                  tabs.length;
                setTab(tabs[next]);
                document.getElementById(`${id}-tab-${next}`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {loading || error ? (
        <Status loading={loading} error={error} retry={retry} />
      ) : (
        <div
          key={`${selected}-${tab}`}
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${tabs.indexOf(tab)}`}
          className="territory-metrics-body"
          data-tab={tab}
          tabIndex={0}
        >
          {tab === "Resumen" && (
            <>
              <div className="territory-metric-grid">
                <div
                  className="territory-gauge"
                  aria-label={`${observedLabel}: ${value == null ? "Sin datos" : pct(value)}`}
                  aria-live="polite"
                >
                  <svg viewBox="0 0 180 112" aria-hidden="true">
                    <path
                      d="M 18 94 A 72 72 0 0 1 162 94"
                      pathLength="100"
                      className="territory-gauge-track"
                    />
                    <path
                      d="M 18 94 A 72 72 0 0 1 162 94"
                      pathLength="100"
                      className="territory-gauge-value"
                      strokeDasharray={`${safe * 100} 100`}
                      style={{ opacity: value == null || value === 0 ? 0 : 1 }}
                    />
                  </svg>
                  <strong className="detail-rate-value">
                    {value == null ? "Sin datos" : pct(value)}
                  </strong>
                  <span>
                    {observedLabel}
                  </span>
                </div>
                <div className="territory-stat-cards">
                  <div>
                    <span>Participación {year}</span>
                    <strong>{pct(rates?.participation)}</strong>
                    <small>
                      {delta == null
                        ? "Sin comparación disponible"
                        : `${pp(delta)} vs. ${previous!.year}`}
                    </small>
                  </div>
                  <div>
                    <span>Abstenciones {year}</span>
                    <strong>{number(observed?.nonvoter_count)}</strong>
                    <small>{pct(value)} sobre SV + NV</small>
                  </div>
                </div>
              </div>
              <p className="territory-metrics-footnote">
                Datos observados · NV / (SV + NV). Los registros sin especificar
                se excluyen del denominador. Actualización automática cada
                minuto.
              </p>
              <h3>Indicadores de contexto</h3>
              {contextRows}
            </>
          )}
          {tab === "Histórico" && (
            <section
              className="territory-tab-view"
              aria-label="Evolución histórica del territorio"
            >
              <div className="territory-section-heading">
                <div>
                  <h3>Evolución de la participación</h3>
                  <p>Una mirada a los procesos anteriores de {name}.</p>
                </div>
                <span className="territory-soft-icon">
                  <History size={17} />
                </span>
              </div>
              <div
                className="territory-type-tabs"
                role="group"
                aria-label="Tipo de elección histórica"
              >
                <button
                  aria-pressed={historyType === "midterm"}
                  onClick={() => setHistoryType("midterm")}
                >
                  Intermedias
                </button>
                <button
                  aria-pressed={historyType === "presidential"}
                  onClick={() => setHistoryType("presidential")}
                >
                  Presidenciales
                </button>
              </div>
              <Status
                loading={history.isPending}
                error={history.error}
                retry={() => void history.refetch()}
              />
              {latest && (
                <>
                  <div className="territory-history-highlights">
                    <div>
                      <span>Participación · {latest.year}</span>
                      <strong>{pct(latest.participation_rate)}</strong>
                      <small>Último proceso del mismo tipo</small>
                    </div>
                    <div>
                      <span>Cambio frente a {prior?.year ?? "—"}</span>
                      <strong className="territory-pink-value">
                        {pp(historicalChange)}
                      </strong>
                      <small>Puntos porcentuales</small>
                    </div>
                  </div>
                  <div className="territory-history-series">
                    <div className="territory-series-heading">
                      <h4>Participación por proceso</h4>
                      <span>{comparable.length} elecciones</span>
                    </div>
                    {comparable.map((record) => (
                      <div className="territory-history-row" key={record.year}>
                        <span className="territory-year">{record.year}</span>
                        <div>
                          <div className="territory-history-bar">
                            <i
                              style={{
                                width: `${(record.participation_rate ?? 0) * 100}%`,
                              }}
                            />
                          </div>
                          <small>
                            Abstención {pct(record.abstention_rate)}
                          </small>
                        </div>
                        <strong>{pct(record.participation_rate)}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {history.isSuccess && !comparable.length && (
                <p className="territory-metrics-footnote">
                  No hay registros disponibles para este tipo de elección.
                </p>
              )}
            </section>
          )}
          {tab === "Factores" && p && (
            <section
              className="territory-tab-view"
              aria-label="Factores y contexto del pronóstico"
            >
              <div className="territory-section-heading">
                <div>
                  <h3>Detrás del pronóstico</h3>
                  <p>Referencia utilizada y señales del territorio.</p>
                </div>
                <span className="territory-soft-icon">
                  <Database size={17} />
                </span>
              </div>
              <div className="territory-model-card">
                <span className="territory-model-label">
                  Referencia del modelo
                </span>
                <div>
                  <strong>{pct(p.predicted)}</strong>
                  <span>
                    Abstención de la última intermedia
                    <br />
                    <b>{p.explanation.reference_year} · baseline_last</b>
                  </span>
                </div>
                <p>
                  La estimación repite el último resultado de una elección del
                  mismo tipo.
                </p>
              </div>
              <div className="territory-series-heading">
                <h4>Señales de contexto</h4>
                <span>Datos históricos</span>
              </div>
              {contextRows}
              <p className="territory-unspecified-help">Participación no especificada (NS): registros donde no se indica si la persona votó. No se cuentan como abstención y se excluyen del cálculo NV / (SV + NV).</p>
              <div className="territory-inline-note">
                <ShieldCheck size={15} />
                <p>
                  Estas señales describen el contexto; no representan causas ni
                  importancia de variables.
                </p>
              </div>
            </section>
          )}
          {tab === "Recomendaciones" && p && (
            <section
              className="territory-tab-view"
              aria-label="Recomendaciones de lectura del territorio"
            >
              <div className="territory-section-heading">
                <div>
                  <h3>Lectura informada</h3>
                  <p>Cuatro claves para interpretar los datos de {name}.</p>
                </div>
                <span className="territory-soft-icon">
                  <ShieldCheck size={17} />
                </span>
              </div>
              <ol className="territory-advice-list">
                <li>
                  <span>01</span>
                  <div>
                    <h4>Compara procesos equivalentes</h4>
                    <p>
                      Revisa elecciones del mismo tipo y los registros sin
                      especificar.
                    </p>
                  </div>
                  <History size={16} />
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <h4>Considera todo el intervalo</h4>
                    <p>
                      La banda va de{" "}
                      <b>
                        {pct(p.lower)} a {pct(p.upper)}
                      </b>
                      . Analízala junto a la estimación puntual.
                    </p>
                  </div>
                  <ChartNoAxesCombined size={16} />
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <h4>Interpreta el nivel de riesgo</h4>
                    <p>
                      {p.uncertainty.classification_uncertain
                        ? "La banda cruza categorías; la clasificación es incierta."
                        : "El semáforo expresa una categoría relativa, no un estándar oficial del INE."}
                    </p>
                  </div>
                  <CircleHelp size={16} />
                </li>
                <li>
                  <span>04</span>
                  <div>
                    <h4>Explora escenarios con cautela</h4>
                    <p>
                      Los cambios son supuestos aritméticos; no prueban efectos
                      de intervenciones.
                    </p>
                  </div>
                  <TrendingUp size={16} />
                </li>
              </ol>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
