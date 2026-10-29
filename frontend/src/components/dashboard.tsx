"use client";
import { AnalysisView } from "./analysis-view";
import { DashboardSelect } from "./ui/dashboard-select";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  BrainCircuit,
  ClipboardList,
  FileText,
  FlaskConical,
  Map,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Risk } from "@/lib/types";
import { Button } from "./ui/button";
import { Methodology, Status } from "./shared";
import { TerritoryMap, type MapDatum } from "./territory-map";
import { Trends } from "./trends";
import { PredictionsView } from "./predictions";
import { Scenarios } from "./scenarios";
import { MLLaboratoryView } from "./ml-laboratory";
import { DashboardInsights } from "./dashboard-insights";
import { DesignTop, type PageHeading } from "./design-top";
import { Reports } from "./reports";
import { DataHeaderStats, DataSources } from "./data-sources";
import { TerritoryMetrics } from "./territory-metrics";

type View =
  | "map"
  | "trends"
  | "predictions"
  | "scenarios"
  | "ml"
  | "laboratory"
  | "reports"
  | "data";
const sections = [
  {
    id: "laboratory" as const,
    label: "Laboratorio de modelos",
    icon: BrainCircuit,
    subtitle: "Compara modelos entrenados y escenarios con evidencia temporal.",
  },
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
  {
    id: "reports" as const,
    label: "Reportes",
    icon: FileText,
    subtitle: "Configura vistas previas estatales con datos oficiales del INE.",
  },
  {
    id: "data" as const,
    label: "Datos",
    icon: ClipboardList,
    subtitle: "Fuentes, cobertura y procedencia de la información.",
  },
];
// Sections that share the map's header design; Análisis IA and Tendencias keep theirs.
const headings: Partial<Record<View, PageHeading>> = {
  map: {
    lead: "Riesgo de",
    highlight: "Abstención Electoral",
    subtitle:
      "Análisis territorial y predicción de escenarios para fortalecer la participación ciudadana.",
  },
  predictions: {
    lead: "Predicciones de",
    highlight: "Abstención 2027",
    subtitle:
      "Estimaciones transparentes por entidad, con sus límites a la vista y un asistente de IA que las explica.",
  },
  scenarios: {
    lead: "Escenarios de",
    highlight: "Participación",
    subtitle:
      "Explora cambios hipotéticos en la participación y compáralos con la estimación base.",
  },
  reports: {
    lead: "Reportes y",
    highlight: "Documentos",
    subtitle:
      "Descarga reportes estatales y comparativos nacionales con fuentes verificables. Los envíos programados siguen pendientes.",
  },
  data: {
    lead: "Gestión de",
    highlight: "Datos",
    subtitle:
      "Consulta, explora y administra la información utilizada en los análisis y modelos de abstención electoral.",
  },
};
const titleCase = (name: string) =>
  name
    .toLocaleLowerCase("es-MX")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-MX"));

export function Dashboard({ preview = false }: { preview?: boolean }) {
  const [view, setView] = useState<View>("map");
  const [selected, setSelected] = useState("17");
  const [year, setYear] = useState(2024);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scenarioChange, setScenarioChange] = useState(3);
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
  const sources = useQuery({
    queryKey: ["sources"],
    queryFn: ({ signal }) => api.sources(signal),
  });
  const items = predictions.data?.items;
  const chosen = items?.find((r) => r.state_code === selected);
  const actual = indicators.data?.items.find(
    (r) => (r.state_code || r.official_code) === selected,
  );
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
  const currentSection = sections.find((s) => s.id === view)!;
  const mapQuery = historical ? indicators : predictions;
  const forecast = predictions.data?.forecast;
  return (
    <div className={`app-shell ${view === "ml" ? "analysis-mode" : ""}`}>
      <a className="skip-link" href="#main">
        Ir al contenido
      </a>
      <DesignTop
        states={items}
        selected={selected}
        view={view}
        heading={headings[view]}
        aside={
          view === "data" ? (
            <DataHeaderStats
              forecast={forecast}
              sources={sources.data?.items}
              states={items?.length ?? 0}
            />
          ) : view === "reports" ? null : undefined
        }
        search={search}
        year={year}
        elections={elections.data ?? [{ id: 2024, year: 2024 }]}
        filtersOpen={filtersOpen}
        onNavigate={setView}
        onSearch={setSearch}
        onYear={setYear}
        onFilters={() => setFiltersOpen((v) => !v)}
        onSearchSubmit={() => setFiltersOpen(true)}
      />
      <div className="workspace">
        <main id="main" tabIndex={-1}>
          <div className={headings[view] ? "sr-only" : "page-heading"}>
            <div>
              <div className="eyebrow">
                PARTICIPACIÓN · ABSTENCIÓN · TERRITORIO
              </div>
              <h1>
                {headings[view] ? (
                  <>
                    {headings[view].lead}{" "}
                    <span>{headings[view].highlight}</span>
                  </>
                ) : (
                  currentSection.label
                )}
              </h1>
              <p>{currentSection.subtitle}</p>
            </div>
            <Button
              hidden={!!headings[view]}
              variant="outline"
              size="sm"
              onClick={() => setFiltersOpen(true)}
            >
              Cambiar territorio
            </Button>
            <span className="experimental">
              <FlaskConical size={14} />
              Prototipo experimental
            </span>
          </div>
          <Dialog.Root open={filtersOpen} onOpenChange={setFiltersOpen}>
            <Dialog.Portal>
              <Dialog.Overlay className="dialog-overlay" />
              <Dialog.Content
                className="dialog-content territory-filter-dialog"
                id="dashboard-filters"
              >
                <Dialog.Title>Seleccionar territorio</Dialog.Title>
                <Dialog.Description>
                  El mapa y sus métricas usan las 32 entidades federativas de
                  México.
                </Dialog.Description>
                <label>
                  <span>Territorio seleccionado</span>
                  <DashboardSelect
                    aria-label="Territorio seleccionado"
                    value={selected}
                    disabled={!items?.length}
                    onChange={(e) => {
                      setSelected(e.target.value);
                      setFiltersOpen(false);
                    }}
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
                  </DashboardSelect>
                </label>
                <p className="muted small">
                  Municipios y secciones requieren homologación histórica antes
                  de habilitarse.
                </p>
                <Dialog.Close asChild>
                  <Button variant="outline">Cerrar filtros</Button>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          {view === "map" && (
            <>
              <div className="map-detail-grid electoral-map-layout">
                <section
                  className="panel map-panel electoral-map-panel"
                  aria-labelledby="map-title"
                >
                  <div className="panel-heading electoral-map-heading">
                    <div className="map-heading-identity">
                      <Map
                        className="map-heading-icon"
                        size={26}
                        aria-hidden="true"
                      />
                      <div>
                        <h2 id="map-title">Mapa de riesgo de abstención</h2>
                        <p className="electoral-map-subtitle">
                          Selecciona un estado para ver sus indicadores.
                        </p>
                      </div>
                    </div>
                    <div className="electoral-map-settings">
                      <label className="map-period-picker">
                        <span>Referencia histórica</span>
                        <DashboardSelect
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
                        </DashboardSelect>
                      </label>
                      <div
                        className="segmented"
                        aria-label="Contenido del mapa"
                      >
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
                      onFilter={setFilter}
                    />
                  )}
                </section>
                <TerritoryMetrics
                  prediction={chosen}
                  actual={actual}
                  selected={selected}
                  year={year}
                  historical={historical}
                  loading={predictions.isPending}
                  error={predictions.error}
                  retry={() => void predictions.refetch()}
                  sources={sources.data?.items}
                  onExplore={() => setView("predictions")}
                />
              </div>
              <DashboardInsights
                states={items ?? []}
                selected={selected}
                onSelect={setSelected}
                onNavigate={(next, change) => {
                  if (change != null) setScenarioChange(change);
                  setView(next);
                }}
                onShowAll={() => setFiltersOpen(true)}
              />
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
              states={items ?? []}
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
              initialChange={scenarioChange}
              loading={predictions.isPending}
              error={predictions.error}
              retry={() => void predictions.refetch()}
            />
          )}
          {view === "ml" && (
            <AnalysisView
              selected={selected}
              onSelect={setSelected}
              year={year}
              onYear={setYear}
              states={items ?? []}
              forecast={forecast}
              elections={elections.data ?? []}
              sources={sources.data?.items}
              loading={predictions.isPending || elections.isPending}
              error={predictions.error ?? elections.error}
              retry={() => {
                void predictions.refetch();
                void elections.refetch();
              }}
              onLaboratory={() => setView("laboratory")}
            />
          )}
          {view === "laboratory" && <MLLaboratoryView selected={selected} />}
          {view === "reports" && (
            <Reports
              states={items ?? []}
              forecast={forecast}
              elections={elections.data ?? []}
              selected={selected}
              year={year}
              loading={predictions.isPending}
              error={predictions.error}
              retry={() => void predictions.refetch()}
            />
          )}
          {view === "data" && (
            <DataSources
              elections={elections.data ?? []}
              sources={sources.data?.items}
              states={items ?? []}
              forecast={forecast}
              search={search}
              onSearch={setSearch}
              year={year}
              selected={selected}
              preview={preview}
            />
          )}
          <footer className="page-footer">
            <Methodology sources={sources.data?.items} />
            <span role="status" data-connected={predictions.isSuccess}>
              {predictions.isSuccess
                ? preview
                  ? "Datos del repositorio"
                  : "Backend conectado"
                : predictions.isError
                  ? "Backend sin conexión"
                  : "Conectando…"}
            </span>
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
