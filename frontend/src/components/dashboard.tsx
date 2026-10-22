"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  BrainCircuit,
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
import { DesignTop } from "./design-top";
import { TerritoryMetrics } from "./territory-metrics";

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
      <DesignTop
        view={view}
        search={search}
        year={year}
        elections={elections.data ?? [{ id: 2024, year: 2024 }]}
        filtersOpen={filtersOpen}
        onNavigate={setView}
        onSearch={setSearch}
        onYear={setYear}
        onFilters={() => setFiltersOpen((v) => !v)}
        onExport={download}
        onData={() => setFiltersOpen(true)}
      />
      <div className="workspace">
        <main id="main" tabIndex={-1}>
          <div className={view === "map" ? "sr-only" : "page-heading"}>
            <div>
              <div className="eyebrow">
                PARTICIPACIÓN · ABSTENCIÓN · TERRITORIO
              </div>
              <h1>
                {view === "map" ? (
                  <>
                    Riesgo de <span>Abstención Electoral</span>
                  </>
                ) : (
                  currentSection.label
                )}
              </h1>
              <p>{currentSection.subtitle}</p>
            </div>
            <Button
              hidden={view === "map"}
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
                  <select
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
                  </select>
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
          {view === "ml" && <MLLaboratoryView selected={selected} />}
          <footer className="page-footer">
            <Methodology sources={sources.data?.items} />
            <span>Tarjetas superiores: valores del diseño</span>
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
