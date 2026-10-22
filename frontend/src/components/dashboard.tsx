"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BrainCircuit,
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  Download,
  FlaskConical,
  Layers3,
  Map,
  MapPin,
  Search,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { pct, riskLabels } from "@/lib/utils";
import type { Risk } from "@/lib/types";
import { Button } from "./ui/button";
import { Methodology, Note, RiskBadge, SourceLink, Status } from "./shared";
import { TerritoryMap, type MapDatum } from "./territory-map";
import { Trends } from "./trends";
import { PredictionsView } from "./predictions";
import { Scenarios } from "./scenarios";
import { MLLaboratoryView } from "./ml-laboratory";

type View = "map" | "trends" | "predictions" | "scenarios" | "ml";
const sections = [
  {
    id: "ml" as const,
    label: "Análisis IA",
    icon: BrainCircuit,
    subtitle:
      "Compara modelos entrenados y explora escenarios con evidencia temporal.",
  },
  {
    id: "map" as const,
    label: "Mapa de riesgo",
    icon: Map,
    subtitle: "Explora el panorama territorial y sus diferencias.",
  },
  {
    id: "trends" as const,
    label: "Tendencias",
    icon: TrendingUp,
    subtitle: "Compara elecciones del mismo tipo a través del tiempo.",
  },
  {
    id: "predictions" as const,
    label: "Predicciones",
    icon: Activity,
    subtitle: "Una estimación transparente, con sus límites a la vista.",
  },
  {
    id: "scenarios" as const,
    label: "Escenarios",
    icon: SlidersHorizontal,
    subtitle: "Explora cambios hipotéticos en la participación territorial.",
  },
];
const titleCase = (name: string) =>
  name
    .toLocaleLowerCase("es-MX")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-MX"));

export function Dashboard({ preview = false }: { preview?: boolean }) {
  const [view, setView] = useState<View>("map");
  const [selected, setSelected] = useState("17");
  const [year, setYear] = useState(2021);
  const [historical, setHistorical] = useState(false);
  const [filter, setFilter] = useState<Risk | "all">("all");
  const [search, setSearch] = useState("");
  const predictions = useQuery({
    queryKey: ["predictions"],
    queryFn: ({ signal }) => api.predictions(signal),
  });
  const elections = useQuery({
    queryKey: ["elections"],
    queryFn: ({ signal }) => api.elections(signal),
  });
  const indicators = useQuery({
    queryKey: ["indicators", year],
    queryFn: ({ signal }) => api.indicators(year, signal),
  });
  const summary = useQuery({
    queryKey: ["summary", year],
    queryFn: ({ signal }) => api.summary(year, signal),
  });
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: ({ signal }) => api.sources(signal),
  });
  const items = predictions.data?.items;
  const chosen = items?.find((r) => r.state_code === selected);
  const actual = indicators.data?.items.find(
    (r) => (r.state_code || r.official_code) === selected,
  );
  const national = summary.data?.items[0];
  const mean = items?.length
    ? items.reduce((s, r) => s + r.predicted, 0) / items.length
    : null;
  const highCount = items?.filter((r) => r.risk_level === "high").length;
  const rows = useMemo<MapDatum[]>(
    () =>
      historical
        ? (indicators.data?.items ?? []).map((r) => ({
            state_code: r.state_code || r.official_code,
            name: r.name,
            value: r.abstention_rate,
          }))
        : (items ?? []).map((r) => ({
            state_code: r.state_code,
            name: r.name,
            value: r.predicted,
            risk: r.risk_level,
          })),
    [historical, indicators.data, items],
  );
  const filtered = rows.filter(
    (r) =>
      (historical || filter === "all" || r.risk === filter) &&
      titleCase(r.name)
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .includes(
          search
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .toLowerCase(),
        ),
  );
  const currentSection = sections.find((s) => s.id === view)!;
  const mapQuery = historical ? indicators : predictions;
  const forecast = predictions.data?.forecast;
  const download = () => {
    const lines = [
      "clave,estado,periodo,tipo,abstencion,riesgo,limite_inferior,limite_superior",
    ];
    for (const row of filtered) {
      const p = items?.find((r) => r.state_code === row.state_code);
      lines.push(
        [
          row.state_code,
          `"${row.name.replaceAll('"', '""')}"`,
          historical ? year : 2027,
          historical ? "observado" : "estimado",
          row.value ?? "",
          historical ? "" : row.risk,
          historical ? "" : p?.lower,
          historical ? "" : p?.upper,
        ].join(","),
      );
    }
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `pulso-${historical ? year : 2027}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Ir al contenido
      </a>
      <aside className="sidebar">
        <a href="/" className="brand" aria-label="Pulso electoral, inicio">
          <span className="brand-mark">
            <Activity size={23} strokeWidth={1.7} />
          </span>
          <span>
            Pulso<span className="brand-sub">INTELIGENCIA ELECTORAL</span>
          </span>
        </a>
        <div className="sidebar-caption">ESPACIO DE ANÁLISIS</div>
        <nav aria-label="Secciones del dashboard">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`nav-item ${view === s.id ? "active" : ""}`}
              aria-label={s.label}
              title={s.label}
              aria-current={view === s.id ? "page" : undefined}
              onClick={() => setView(s.id)}
            >
              <s.icon size={19} strokeWidth={1.5} />
              <span>{s.label}</span>
              {view === s.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="prototype">
            <FlaskConical size={18} />
            <div>
              <strong>Exploración, con contexto</strong>
              <p>Datos oficiales. Estimaciones experimentales.</p>
            </div>
          </div>
          <div className="sidebar-footer">
            <span className="status-indicator" />
            <span role="status" data-connected={predictions.isSuccess}>
              {predictions.isSuccess
                ? preview
                  ? "Vista previa local"
                  : "Backend conectado"
                : predictions.isError
                  ? "Backend sin conexión"
                  : "Conectando…"}
            </span>
            <span>v0.1</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Análisis territorial
            <ChevronRight size={14} />
            <strong>{currentSection.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="data-badge">
              <span />
              Datos abiertos del INE
            </span>
            <Methodology sources={sources.data?.items} />
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                PARTICIPACIÓN · ABSTENCIÓN · TERRITORIO
              </div>
              <h1>
                {view === "map" ? "Panorama territorial" : currentSection.label}
              </h1>
              <p>{currentSection.subtitle}</p>
            </div>
            <span className="experimental">
              <FlaskConical size={14} />
              Prototipo experimental
            </span>
          </div>
          {preview && (
            <div className="preview-banner" role="status">
              <strong>Vista previa interactiva</strong>
              <span>
                Datos de muestra del repositorio · Sin conexión a la base de
                datos. Los escenarios no se guardan.
              </span>
            </div>
          )}
          <div className="global-filters">
            <label>
              <span>
                <MapPin size={14} />
                Territorio seleccionado
              </span>
              <select
                aria-label="Territorio seleccionado"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={!items?.length}
              >
                {items?.length ? (
                  items.map((r) => (
                    <option key={r.state_code} value={r.state_code}>
                      {titleCase(r.name)}
                    </option>
                  ))
                ) : (
                  <option value="17">Consultando estados…</option>
                )}
              </select>
            </label>
            <label>
              <span>
                <Layers3 size={14} />
                Nivel territorial
              </span>
              <select aria-label="Nivel territorial" defaultValue="state">
                <option value="state">Estatal · 32 entidades</option>
                <option disabled>Municipal · sin homologación histórica</option>
                <option disabled>Distrito / sección · no disponible</option>
              </select>
            </label>
            <div className="filter-context">
              <span className="tiny-dot" />
              Estimación 2027 · Elección intermedia
            </div>
          </div>
          {view === "map" && (
            <>
              <div className="kpi-grid">
                <div className="kpi">
                  <div className="kpi-label">
                    Abstención histórica <span>{year}</span>
                  </div>
                  <strong>{pct(national?.abstention_rate)}</strong>
                  <div className="kpi-description">
                    Nacional · ponderada por SV + NV
                  </div>
                  {summary.isError && (
                    <button
                      className="text-link"
                      onClick={() => void summary.refetch()}
                    >
                      Reintentar indicador
                    </button>
                  )}
                </div>
                <div className="kpi">
                  <div className="kpi-label">
                    Abstención estimada <span>2027</span>
                  </div>
                  <strong className="purple-text">{pct(mean)}</strong>
                  <div className="kpi-description">
                    Media simple de los 32 estados
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">
                    Estados con riesgo alto <span>2027</span>
                  </div>
                  <strong>
                    {highCount == null ? "—" : highCount}
                    <small> / {items?.length ?? "—"}</small>
                    <span className="kpi-spark">
                      <AlertTriangle size={22} />
                    </span>
                  </strong>
                  <div className="kpi-description">
                    Categoría relativa · con incertidumbre
                  </div>
                </div>
              </div>
              <div className="map-detail-grid">
                <section
                  className="panel map-panel"
                  aria-labelledby="map-title"
                >
                  <div className="panel-heading">
                    <div>
                      <h2 id="map-title">
                        {historical
                          ? `Abstención observada · ${year}`
                          : "Riesgo de abstención · 2027"}
                      </h2>
                      <p>Selecciona un estado para explorar su perfil.</p>
                    </div>
                    <div className="segmented" aria-label="Contenido del mapa">
                      <button
                        aria-pressed={!historical}
                        onClick={() => setHistorical(false)}
                      >
                        Estimación
                      </button>
                      <button
                        aria-pressed={historical}
                        onClick={() => setHistorical(true)}
                      >
                        Histórico
                      </button>
                    </div>
                  </div>
                  <div className="map-filters">
                    <label className="inline-label">
                      Referencia histórica
                      <select
                        aria-label="Año histórico"
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        disabled={!elections.data}
                      >
                        {elections.data?.map((e) => (
                          <option key={e.id} value={e.year}>
                            {e.year} ·{" "}
                            {e.election_type === "midterm"
                              ? "Intermedia"
                              : "Presidencial"}
                          </option>
                        )) ?? <option value="2021">2021</option>}
                      </select>
                    </label>
                    <span className="small muted">
                      {historical
                        ? "Tasas observadas"
                        : "Modelo · baseline_last"}
                    </span>
                  </div>
                  <Status
                    loading={mapQuery.isPending}
                    error={mapQuery.error}
                    empty={mapQuery.isSuccess && !rows.length}
                    retry={() => void mapQuery.refetch()}
                  />
                  {mapQuery.isSuccess && rows.length > 0 && (
                    <TerritoryMap
                      rows={rows}
                      selected={selected}
                      onSelect={setSelected}
                      filter={filter}
                      historical={historical}
                    />
                  )}
                  <div className="map-legend">
                    {historical ? (
                      <>
                        <span>Menor abstención</span>
                        <span className="gradient-legend" />
                        <span>Mayor abstención</span>
                      </>
                    ) : (
                      <>
                        <span className="legend-title">Riesgo relativo</span>
                        {(["low", "medium", "high"] as Risk[]).map((r) => (
                          <button
                            key={r}
                            className={`legend-item ${filter === r ? "is-filtered" : ""}`}
                            aria-pressed={filter === r}
                            onClick={() => setFilter(filter === r ? "all" : r)}
                          >
                            <span className={`legend-dot ${r}`} />
                            {riskLabels[r]}
                          </button>
                        ))}
                        {filter !== "all" && (
                          <button
                            className="text-link"
                            onClick={() => setFilter("all")}
                          >
                            Ver todos
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </section>
                <aside
                  className="panel territory-detail"
                  aria-label="Detalle del territorio"
                >
                  {chosen ? (
                    <>
                      <div className="detail-overline">
                        <MapPin size={16} />
                        <span>PERFIL TERRITORIAL</span>
                        <span className="state-code">{chosen.state_code}</span>
                      </div>
                      <h2>{titleCase(chosen.name)}</h2>
                      <p className="muted small">Entidad federativa · México</p>
                      <div className="detail-rate">
                        <span>Abstención estimada · 2027</span>
                        <strong>{pct(chosen.predicted)}</strong>
                        <RiskBadge risk={chosen.risk_level} />
                      </div>
                      <div
                        className="complement-bar"
                        aria-label={`Participación estimada ${pct(1 - chosen.predicted)}`}
                      >
                        <span
                          style={{ width: `${(1 - chosen.predicted) * 100}%` }}
                        />
                      </div>
                      <div className="bar-labels">
                        <span>
                          <i />
                          Participación
                        </span>
                        <strong>{pct(1 - chosen.predicted)}</strong>
                      </div>
                      <div className="detail-facts">
                        <div>
                          <span>Banda de referencia</span>
                          <strong>
                            {pct(chosen.lower)} – {pct(chosen.upper)}
                          </strong>
                        </div>
                        <div>
                          <span>Abstención observada · {year}</span>
                          <strong>{pct(actual?.abstention_rate)}</strong>
                        </div>
                        <div>
                          <span>Sin especificar · {year}</span>
                          <strong>{pct(actual?.unspecified_rate)}</strong>
                        </div>
                      </div>
                      <Note>
                        {chosen.uncertainty.classification_uncertain
                          ? "La banda cruza categorías de riesgo. Interpreta el semáforo con cautela."
                          : "La banda es una referencia empírica; no garantiza cobertura futura."}
                      </Note>
                      <Button
                        variant="outline"
                        className="full-width"
                        onClick={() => setView("predictions")}
                      >
                        Explorar predicción
                        <ArrowUpRight size={15} />
                      </Button>
                      <SourceLink
                        id={chosen.explanation.source_id}
                        sources={sources.data?.items}
                        label="Fuente del modelo · INE 2021"
                      />
                    </>
                  ) : (
                    <Status
                      loading={predictions.isPending}
                      error={predictions.error}
                      retry={() => void predictions.refetch()}
                    />
                  )}
                </aside>
              </div>
              <section
                className="panel territory-table"
                aria-labelledby="table-title"
              >
                <div className="panel-heading">
                  <div>
                    <h2 id="table-title">Los datos, estado por estado</h2>
                    <p>
                      {filtered.length} entidades visibles ·{" "}
                      {historical ? `Observado ${year}` : "Estimación 2027"} ·
                      Tasas sobre SV + NV
                    </p>
                  </div>
                  <div className="table-actions">
                    <label className="search-field">
                      <Search size={16} />
                      <input
                        aria-label="Buscar estado en la tabla"
                        placeholder="Buscar estado…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!filtered.length}
                      onClick={download}
                    >
                      <Download size={15} />
                      CSV
                    </Button>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <caption className="sr-only">
                      Alternativa accesible al mapa. Selecciona un estado para
                      ver su detalle.
                    </caption>
                    <thead>
                      <tr>
                        <th>Entidad federativa</th>
                        <th>Participación</th>
                        <th>Abstención</th>
                        <th>
                          {historical
                            ? "Sin especificar"
                            : "Banda de referencia"}
                        </th>
                        {!historical && <th>Riesgo relativo</th>}
                        <th>
                          <span className="sr-only">Seleccionar</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => {
                        const pred = items?.find(
                          (p) => p.state_code === r.state_code,
                        );
                        const obs = indicators.data?.items.find(
                          (p) =>
                            (p.state_code || p.official_code) === r.state_code,
                        );
                        return (
                          <tr
                            key={r.state_code}
                            className={
                              selected === r.state_code ? "selected-row" : ""
                            }
                          >
                            <td>
                              <button
                                className="state-button"
                                onClick={() => setSelected(r.state_code)}
                                aria-pressed={selected === r.state_code}
                              >
                                <span className="table-code">
                                  {r.state_code}
                                </span>
                                {titleCase(r.name)}
                              </button>
                            </td>
                            <td>{r.value == null ? "—" : pct(1 - r.value)}</td>
                            <td className="value-cell">{pct(r.value)}</td>
                            <td>
                              {historical
                                ? pct(obs?.unspecified_rate)
                                : `${pct(pred?.lower)} – ${pct(pred?.upper)}`}
                            </td>
                            {!historical && (
                              <td>{r.risk && <RiskBadge risk={r.risk} />}</td>
                            )}
                            <td>
                              <ChevronRight size={14} className="muted" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {mapQuery.isSuccess && filtered.length === 0 && (
                    <Status empty />
                  )}
                </div>
                <div className="table-footer">
                  <CircleHelp size={14} />
                  {historical
                    ? "NS se excluye de las tasas de participación y abstención."
                    : "La categoría usa la estimación puntual. La banda puede abarcar varias categorías."}
                </div>
              </section>
            </>
          )}
          {view === "trends" && (
            <Trends
              selected={selected}
              states={items ?? []}
              sources={sources.data?.items}
            />
          )}
          {view === "predictions" && (
            <PredictionsView
              prediction={chosen}
              forecast={forecast}
              sources={sources.data?.items}
              loading={predictions.isPending}
              error={predictions.error}
              retry={() => void predictions.refetch()}
            />
          )}
          {view === "scenarios" && (
            <Scenarios
              prediction={chosen}
              forecast={forecast}
              loading={predictions.isPending}
              error={predictions.error}
              retry={() => void predictions.refetch()}
            />
          )}
          {view === "ml" && <MLLaboratoryView selected={selected} />}
          <footer className="page-footer">
            <span>Datos: INE · Geografía: INEGI</span>
            <span>
              Tasas con participación conocida · Modelo sin validación operativa
            </span>
            <span>Pulso electoral / 2026</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
