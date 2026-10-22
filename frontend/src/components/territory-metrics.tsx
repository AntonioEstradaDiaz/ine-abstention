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
} from "lucide-react";
import { api } from "@/lib/api";
import type { Indicator, Prediction, Source } from "@/lib/types";
import { number, pct, pp } from "@/lib/utils";
import { RiskBadge, SourceLink, Status } from "./shared";
import { Button } from "./ui/button";

const tabs = ["Resumen", "Histórico", "Factores", "Recomendaciones"] as const;
type Tab = (typeof tabs)[number];
export function TerritoryMetrics({
  prediction: p,
  actual,
  selected,
  year,
  historical,
  loading,
  error,
  retry,
  sources,
  onExplore,
}: {
  prediction?: Prediction;
  actual?: Indicator;
  selected: string;
  year: number;
  historical: boolean;
  loading: boolean;
  error: Error | null;
  retry: () => void;
  sources?: Source[];
  onExplore: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Resumen");
  const id = useId();
  const history = useQuery({
    queryKey: ["history", selected],
    queryFn: ({ signal }) => api.history(selected, signal),
    enabled: !!p,
  });
  const records = (history.data?.items ?? [])
    .slice()
    .sort((a, b) => a.year - b.year);
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
  const value = historical ? actual?.abstention_rate : p?.predicted;
  const safe = value == null ? 0 : Math.min(1, Math.max(0, value));
  const context = p?.explanation.context_only;
  const name = p?.name
    .toLocaleLowerCase("es-MX")
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
      label: `Sin especificar · ${year}`,
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
      {!p ? (
        <Status loading={loading} error={error} retry={retry} />
      ) : (
        <div
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${tabs.indexOf(tab)}`}
          className="territory-metrics-body"
          tabIndex={0}
        >
          {tab === "Resumen" && (
            <>
              <div className="territory-metric-grid">
                <div
                  className="territory-gauge"
                  aria-label={`${historical ? `Abstención observada ${year}` : "Abstención estimada 2027"}: ${pct(value)}`}
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
                    />
                  </svg>
                  <strong className="detail-rate-value">{pct(value)}</strong>
                  <span>
                    {historical ? `Abstención · ${year}` : "Abstención · 2027"}
                  </span>
                </div>
                <div className="territory-stat-cards">
                  <div>
                    <span>Participación {year}</span>
                    <strong>{pct(actual?.participation_rate)}</strong>
                    <small>
                      {delta == null
                        ? "Sin comparación disponible"
                        : `${pp(delta)} vs. ${previous!.year}`}
                    </small>
                  </div>
                  <div>
                    <span>Abstenciones {year}</span>
                    <strong>{number(actual?.nonvoter_count)}</strong>
                    <small>{pct(actual?.abstention_rate)} sobre SV + NV</small>
                  </div>
                  <div className="territory-band">
                    <span>Banda del pronóstico 2027</span>
                    <strong>
                      {pct(p.lower)} – {pct(p.upper)}
                    </strong>
                    <span className="territory-band-track" aria-hidden="true">
                      <i
                        style={{
                          left: `${p.lower * 100}%`,
                          width: `${(p.upper - p.lower) * 100}%`,
                        }}
                      />
                    </span>
                  </div>
                </div>
              </div>
              <h3>Indicadores de contexto</h3>
              {contextRows}
              <p className="territory-metrics-footnote">
                Contexto histórico, no contribuciones causales. El semáforo
                corresponde al pronóstico estatal 2027; la banda no garantiza
                cobertura futura.
              </p>
            </>
          )}
          {tab === "Histórico" && (
            <>
              <h3>Participación histórica</h3>
              <p className="territory-metrics-footnote">
                Compara elecciones del mismo tipo. NS se conserva por separado.
              </p>
              <Status
                loading={history.isPending}
                error={history.error}
                retry={() => void history.refetch()}
              />
              <div className="territory-history">
                <table>
                  <thead>
                    <tr>
                      <th>Año / elección</th>
                      <th>Participación</th>
                      <th>Abstención</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.year}>
                        <td>
                          {r.year}
                          <small>
                            {r.election_type === "midterm"
                              ? "Intermedia"
                              : "Presidencial"}
                          </small>
                        </td>
                        <td>{pct(r.participation_rate)}</td>
                        <td>{pct(r.abstention_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab === "Factores" && (
            <>
              <h3>Qué utiliza este pronóstico</h3>
              <p className="territory-metrics-footnote">
                La referencia baseline_last repite la abstención de la última
                elección del mismo tipo ({p.explanation.reference_year}). Los
                indicadores siguientes describen el contexto y no son
                importancias de variables.
              </p>
              {contextRows}
              <p className="territory-metrics-footnote">
                Características sociodemográficas, condiciones socioeconómicas,
                accesibilidad y conectividad: sin contribución estimada en este
                modelo.
              </p>
              <Button variant="outline" size="sm" onClick={onExplore}>
                Ver modelo y evaluación
              </Button>
            </>
          )}
          {tab === "Recomendaciones" && (
            <>
              <h3>Claves para interpretar los datos</h3>
              <ul className="territory-reading-tips">
                <li>
                  Contrasta {name} con elecciones del mismo tipo y revisa los
                  registros sin especificar.
                </li>
                <li>
                  Considera la banda completa ({pct(p.lower)} – {pct(p.upper)}),
                  además de la estimación puntual.
                </li>
                <li>
                  {p.uncertainty.classification_uncertain
                    ? "La banda cruza categorías: la clasificación de riesgo es incierta."
                    : "El semáforo es una categoría relativa, no un estándar oficial del INE."}
                </li>
                <li>
                  Los escenarios representan supuestos aritméticos; no prueban
                  efectos de intervenciones.
                </li>
              </ul>
              <Button variant="outline" size="sm" onClick={onExplore}>
                Explorar predicción
              </Button>
            </>
          )}
          <SourceLink
            id={historical ? actual?.source_id : p.explanation.source_id}
            sources={sources}
            label={`Fuente · INE ${historical ? year : p.explanation.reference_year}`}
          />
        </div>
      )}
    </aside>
  );
}
