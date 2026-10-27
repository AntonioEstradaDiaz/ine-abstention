"use client";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpDown,
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  Lightbulb,
  Map as MapIcon,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Election, Forecast, Prediction, Risk, Source } from "@/lib/types";
import { number, pct, riskLabels } from "@/lib/utils";
import { PageKpis } from "./page-kpis";
import { RiskBadge, Status } from "./shared";
import { Button } from "./ui/button";
import { DashboardSelect } from "./ui/dashboard-select";

type Level = "national" | "state" | "municipal";
type Column = "participation" | "abstention" | "risk" | "counts" | "nominal";
type Cell = string | number | null;
interface Row {
  id: string;
  name: string;
  entity: string;
  participation: number | null;
  abstention: number | null;
  risk?: Risk;
  voters?: number;
  nonvoters?: number;
  unspecified?: number;
  nominal?: number;
  source: string;
}
const dataTypes: Array<{ id: Column; label: string }> = [
  { id: "participation", label: "Participación electoral" },
  { id: "abstention", label: "Abstención" },
  { id: "risk", label: "Riesgo estimado 2027" },
  { id: "nominal", label: "Lista nominal" },
  { id: "counts", label: "Conteos SV, NV y NS" },
];
const variables = [
  {
    id: "abstention",
    label: "Tasa de abstención",
    description:
      "Porcentaje de personas con participación conocida que no emitieron su voto: NV / (SV + NV).",
    source: "INE · Conteos censales de participación (CCPC)",
  },
  {
    id: "participation",
    label: "Tasa de participación",
    description:
      "Porcentaje de personas con participación conocida que votaron: SV / (SV + NV).",
    source: "INE · Conteos censales de participación (CCPC)",
  },
  {
    id: "nominal",
    label: "Lista nominal",
    description:
      "Personas registradas con credencial vigente para votar en cada elección.",
    source: "INE · Conteos censales de participación (CCPC)",
  },
  {
    id: "unspecified",
    label: "Sin especificar (NS)",
    description:
      "Registros sin participación especificada; se excluyen del denominador de las tasas.",
    source: "INE · Conteos censales de participación (CCPC)",
  },
  {
    id: "risk",
    label: "Riesgo estimado 2027",
    description:
      "Semáforo relativo de la abstención estimada para la intermedia de 2027. No es un estándar oficial del INE.",
    source: "Modelo Pulso electoral · baseline_last",
  },
];
const glossary = [
  ["SV", "Personas de la lista nominal que votaron (sí votó)."],
  ["NV", "Personas de la lista nominal que no votaron (no votó)."],
  ["NS", "Registros sin especificar; se excluyen del denominador."],
  ["Lista nominal", "Personas registradas con credencial vigente para votar."],
  ["Participación", "SV / (SV + NV): tasa sobre participación conocida."],
  ["Abstención", "NV / (SV + NV): complemento de la participación."],
  ["Banda", "Rango empírico de errores temporales; sin cobertura garantizada."],
  [
    "Riesgo",
    "Semáforo relativo por terciles históricos; no es estándar del INE.",
  ],
];
const titleCase = (name: string) =>
  name
    .toLocaleLowerCase("es-MX")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-MX"));
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const shortDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";

// Header chips that sit beside the title, as in the reference design.
export function DataHeaderStats({
  forecast,
  sources,
  states,
}: {
  forecast?: Forecast;
  sources?: Source[];
  states: number;
}) {
  const stats = [
    {
      icon: CalendarDays,
      label: "Última actualización",
      value: shortDate(forecast?.created_at),
    },
    {
      icon: ShieldCheck,
      label: "Fuentes de datos",
      value: sources ? `${sources.length + 1} activas` : "—",
    },
    { icon: Database, label: "Cobertura", value: `${states} entidades` },
  ];
  return (
    <ul className="data-header-stats" aria-label="Estado de los datos">
      {stats.map((s) => (
        <li key={s.label}>
          <span aria-hidden="true">
            <s.icon />
          </span>
          <div>
            <small>{s.label}</small>
            <strong>{s.value}</strong>
          </div>
        </li>
      ))}
    </ul>
  );
}

function save(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
const csvCell = (v: Cell) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function DataSources({
  elections,
  sources,
  states,
  forecast,
  search,
  onSearch,
  year: initialYear,
  selected,
  preview,
}: {
  elections: Election[];
  sources?: Source[];
  states: Prediction[];
  forecast?: Forecast;
  search: string;
  onSearch: (value: string) => void;
  year: number;
  selected: string;
  preview: boolean;
}) {
  const initialEntity =
    titleCase(states.find((s) => s.state_code === selected)?.name ?? "") ||
    "Guerrero";
  const defaults = {
    types: ["participation", "abstention", "risk"] as Column[],
    level: "state" as Level,
    entity: "all",
    year: initialYear,
    source: "all",
  };
  const [draft, setDraft] = useState(defaults);
  const [applied, setApplied] = useState(defaults);
  const [sort, setSort] = useState<{ key: keyof Row; asc: boolean }>({
    key: "abstention",
    asc: false,
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [checked, setChecked] = useState<string[]>([]);
  const [variable, setVariable] = useState("abstention");
  const [menu, setMenu] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const coverage = useQueries({
    queries: elections.map((e) => ({
      queryKey: ["indicators", e.year],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.indicators(e.year, signal),
    })),
  });
  const loading = coverage.some((q) => q.isPending);
  const error = coverage.find((q) => q.error)?.error ?? null;
  const all = coverage.flatMap((q) => q.data?.items ?? []);
  const years = elections.map((e) => e.year);
  const risks = new Map(states.map((s) => [s.state_code, s.risk_level]));
  const municipalStates: string[] = [];

  const rows: Row[] = useMemo(() => {
    const ofYear = all.filter((r) => r.year === applied.year);
    const useSource = (id: string) =>
      applied.source === "all" || applied.source === id;
    if (applied.level === "national")
      return years.map((y) => {
        const group = all.filter((r) => r.year === y);
        const sv = group.reduce((s, r) => s + r.voter_count, 0);
        const nv = group.reduce((s, r) => s + r.nonvoter_count, 0);
        return {
          id: String(y),
          name: `Nacional ${y}`,
          entity:
            elections.find((e) => e.year === y)?.election_type === "midterm"
              ? "Intermedia"
              : "Presidencial",
          participation: sv + nv ? sv / (sv + nv) : null,
          abstention: sv + nv ? nv / (sv + nv) : null,
          voters: sv,
          nonvoters: nv,
          unspecified: group.reduce((s, r) => s + r.unspecified_count, 0),
          nominal: group.reduce((s, r) => s + r.nominal_list, 0),
          source: `INE · CCPC ${y}`,
        };
      });
    if (applied.level === "municipal") {
      return [];
    }
    return ofYear
      .filter(
        (r) => applied.entity === "all" || titleCase(r.name) === applied.entity,
      )
      .map((r) => {
        const code = r.state_code || r.official_code;
        return {
          id: code,
          name: titleCase(r.name),
          entity: code,
          participation: useSource("ine") ? r.participation_rate : null,
          abstention: useSource("ine") ? r.abstention_rate : null,
          risk: useSource("model") ? risks.get(code) : undefined,
          voters: r.voter_count,
          nonvoters: r.nonvoter_count,
          unspecified: r.unspecified_count,
          nominal: r.nominal_list,
          source: `INE · CCPC ${r.year}`,
        };
      });
  }, [all.length, applied, states]);

  const needle = fold(search.trim());
  const filtered = rows
    .filter((r) => !needle || fold(`${r.name} ${r.entity}`).includes(needle))
    .sort((a, b) => {
      const x = a[sort.key] ?? -Infinity;
      const y = b[sort.key] ?? -Infinity;
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y), "es");
      return sort.asc ? cmp : -cmp;
    });
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * perPage, current * perPage);
  const show = (c: Column) => applied.types.includes(c);
  const quality = all.length
    ? all.filter(
        (r) => r.participation_rate != null && r.abstention_rate != null,
      ).length / all.length
    : null;
  const info = variables.find((v) => v.id === variable)!;
  const levelLabel = {
    national: "Nacional",
    state: "Estatal",
    municipal: "Municipal",
  }[applied.level];

  const columns: Array<{
    key: keyof Row;
    label: string;
    visible: boolean;
    value: (r: Row) => Cell;
  }> = [
    {
      key: "name",
      label:
        applied.level === "municipal"
          ? "Municipio"
          : applied.level === "national"
            ? "Proceso"
            : "Entidad",
      visible: true,
      value: (r) => r.name,
    },
    {
      key: "entity",
      label:
        applied.level === "municipal"
          ? "Entidad"
          : applied.level === "national"
            ? "Tipo"
            : "Clave",
      visible: true,
      value: (r) => r.entity,
    },
    {
      key: "participation",
      label: `Participación ${applied.level === "national" ? "" : applied.level === "municipal" ? "2024" : applied.year}`,
      visible: show("participation"),
      value: (r) => pct(r.participation),
    },
    {
      key: "abstention",
      label: `Abstención ${applied.level === "national" ? "" : applied.level === "municipal" ? "2024" : applied.year}`,
      visible: show("abstention"),
      value: (r) => pct(r.abstention),
    },
    {
      key: "risk",
      label: "Riesgo 2027",
      visible: show("risk") && applied.level === "state",
      value: (r) => (r.risk ? riskLabels[r.risk] : "—"),
    },
    {
      key: "nominal",
      label: "Lista nominal",
      visible: show("nominal") && applied.level !== "municipal",
      value: (r) => r.nominal ?? null,
    },
    {
      key: "voters",
      label: "SV",
      visible: show("counts") && applied.level !== "municipal",
      value: (r) => r.voters ?? null,
    },
    {
      key: "nonvoters",
      label: "NV",
      visible: show("counts") && applied.level !== "municipal",
      value: (r) => r.nonvoters ?? null,
    },
    {
      key: "unspecified",
      label: "NS",
      visible: show("counts") && applied.level !== "municipal",
      value: (r) => r.unspecified ?? null,
    },
    { key: "source", label: "Fuente", visible: true, value: (r) => r.source },
  ];
  const shown = columns.filter((c) => c.visible);
  const exportRows = checked.length
    ? filtered.filter((r) => checked.includes(r.id))
    : filtered;
  const file = `pulso-datos-${{ national: "nacional", state: "estatal", municipal: "municipal" }[applied.level]}-${applied.level === "national" ? "2009-2024" : applied.year}`;
  const download = (format: "csv" | "json") => {
    setMenu(false);
    if (format === "csv")
      save(
        `${file}.csv`,
        "text/csv;charset=utf-8",
        "﻿" +
          [
            shown.map((c) => c.label.trim()),
            ...exportRows.map((r) => shown.map((c) => c.value(r))),
          ]
            .map((row) => row.map(csvCell).join(","))
            .join("\r\n"),
      );
    else
      save(
        `${file}.json`,
        "application/json",
        JSON.stringify(
          {
            nivel: levelLabel,
            fuente:
              applied.level === "municipal"
                ? "Muestra ilustrativa · no oficial"
                : "INE · Conteos censales de participación (CCPC)",
            generado: new Date().toISOString(),
            registros: exportRows.map((r) =>
              Object.fromEntries(
                shown.map((c) => [c.label.trim(), c.value(r)]),
              ),
            ),
          },
          null,
          2,
        ),
      );
  };
  const toggleSort = (key: keyof Row) =>
    setSort((s) => ({ key, asc: s.key === key ? !s.asc : false }));
  const pageButtons = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pages || Math.abs(n - current) <= 2,
  );

  return (
    <div className="section-page data-page">
      <div className="data-layout">
        <aside
          className="section-card data-filters"
          aria-labelledby="filters-title"
        >
          <header className="data-filters-heading">
            <Filter aria-hidden="true" />
            <h2 id="filters-title">Filtros</h2>
          </header>
          <fieldset>
            <legend>Tipo de datos</legend>
            {dataTypes.map((t) => (
              <label key={t.id} className="data-check">
                <input
                  type="checkbox"
                  checked={draft.types.includes(t.id)}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      types: e.target.checked
                        ? [...d.types, t.id]
                        : d.types.filter((x) => x !== t.id),
                    }))
                  }
                />
                <span>{t.label}</span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Nivel geográfico</legend>
            {(
              [
                ["national", "Nacional"],
                ["state", "Estatal"],
                ["municipal", "Municipal"],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="data-radio">
                <input
                  type="radio"
                  name="data-level"
                  checked={draft.level === id}
                  disabled={id === "municipal"}
                  onChange={() =>
                    setDraft((d) => ({
                      ...d,
                      level: id,
                      entity:
                        id === "municipal" &&
                        !municipalStates.includes(d.entity)
                          ? municipalStates.includes(initialEntity)
                            ? initialEntity
                            : municipalStates[0]
                          : d.entity,
                    }))
                  }
                />
                <span>{label}</span>
                {id === "municipal" && <em>No disponible</em>}
              </label>
            ))}
            <p className="section-card-note">
              El nivel municipal requiere homologación oficial. La muestra
              ilustrativa fue retirada.
            </p>
          </fieldset>
          <label className="data-field">
            <span>Entidad</span>
            <DashboardSelect
              aria-label="Entidad"
              value={draft.entity}
              disabled={draft.level === "national"}
              onChange={(e) =>
                setDraft((d) => ({ ...d, entity: e.target.value }))
              }
            >
              {draft.level !== "municipal" && (
                <option value="all">Todas las entidades</option>
              )}
              {(draft.level === "municipal"
                ? municipalStates
                : states
                    .map((s) => titleCase(s.name))
                    .sort((a, b) => a.localeCompare(b, "es"))
              ).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </DashboardSelect>
          </label>
          <label className="data-field">
            <span>Año / Proceso</span>
            <DashboardSelect
              aria-label="Año o proceso"
              value={draft.year}
              disabled={draft.level !== "state"}
              onChange={(e) =>
                setDraft((d) => ({ ...d, year: Number(e.target.value) }))
              }
            >
              {elections.map((e) => (
                <option key={e.year} value={e.year}>
                  {e.year} ·{" "}
                  {e.election_type === "midterm"
                    ? "Intermedia"
                    : "Presidencial"}
                </option>
              ))}
            </DashboardSelect>
          </label>
          <label className="data-field">
            <span>Fuente</span>
            <DashboardSelect
              aria-label="Fuente"
              value={draft.source}
              onChange={(e) =>
                setDraft((d) => ({ ...d, source: e.target.value }))
              }
            >
              <option value="all">Todas</option>
              <option value="ine">INE · CCPC</option>
              <option value="model">Modelo Pulso 2027</option>
            </DashboardSelect>
          </label>
          <div className="data-filter-actions">
            <Button
              onClick={() => {
                setApplied(draft);
                setPage(1);
                setChecked([]);
              }}
            >
              <Filter size={16} />
              Aplicar filtros
            </Button>
            <button
              type="button"
              className="data-link-button"
              onClick={() => {
                setDraft(defaults);
                setApplied(defaults);
                setPage(1);
                setChecked([]);
                onSearch("");
              }}
            >
              <RotateCcw size={14} />
              Limpiar filtros
            </button>
          </div>
        </aside>

        <div className="data-center">
          <PageKpis
            label="Resumen de datos"
            items={[
              {
                title: "Total de registros",
                value: number(all.length),
                reference: `${new Set(all.map((r) => r.state_code || r.official_code)).size} entidades × ${years.length} elecciones`,
                icon: Database,
              },
              {
                title: "Variables disponibles",
                value: String(variables.length + 3),
                reference: "Indicadores y conteos",
                icon: BarChart3,
              },
              {
                title: "Fuentes de datos",
                value: String((sources?.length ?? 0) + 1),
                reference: "INE · CCPC e INEGI",
                icon: ShieldCheck,
              },
              {
                title: "Última actualización",
                value: shortDate(forecast?.created_at),
                reference: preview
                  ? "Copia del repositorio"
                  : "Datos verificados",
                icon: CalendarDays,
              },
            ]}
          />
          <section
            className="section-card data-explorer"
            aria-labelledby="explorer-title"
          >
            <header className="section-card-heading">
              <Database className="section-card-icon" aria-hidden="true" />
              <div>
                <h2 id="explorer-title">Explorador de datos</h2>
                <p>
                  Visualiza y consulta la información disponible para los
                  análisis · Nivel {levelLabel.toLowerCase()}
                </p>
              </div>
              <div className="section-card-actions">
                <label className="data-search">
                  <Search aria-hidden="true" />
                  <input
                    aria-label="Buscar en los datos"
                    placeholder="Buscar entidad, municipio o proceso…"
                    value={search}
                    onChange={(e) => {
                      onSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <div className="data-download">
                  <button
                    type="button"
                    className="data-download-trigger"
                    aria-expanded={menu}
                    aria-haspopup="menu"
                    onClick={() => setMenu((m) => !m)}
                    disabled={!exportRows.length}
                  >
                    <Download size={16} />
                    Descargar datos
                    <ChevronDown size={14} />
                  </button>
                  {menu && (
                    <div className="data-download-menu" role="menu">
                      <button role="menuitem" onClick={() => download("csv")}>
                        <FileSpreadsheet size={15} />
                        CSV (Excel)
                      </button>
                      <button role="menuitem" onClick={() => download("json")}>
                        <Database size={15} />
                        JSON
                      </button>
                      <small>
                        {checked.length
                          ? `${checked.length} filas seleccionadas`
                          : `${filtered.length} filas filtradas`}
                      </small>
                    </div>
                  )}
                </div>
              </div>
            </header>
            {applied.level === "municipal" && (
              <p className="data-illustrative">
                <strong>Datos ilustrativos.</strong> Muestra municipal de
                diseño, igual que en Análisis; no son cifras oficiales del INE.
              </p>
            )}
            <Status
              loading={loading}
              error={error}
              empty={!loading && !error && !filtered.length}
              retry={() => coverage.forEach((q) => void q.refetch())}
            />
            {!loading && !error && filtered.length > 0 && (
              <>
                <div className="section-table-scroll data-table-scroll">
                  <table className="section-table data-table">
                    <thead>
                      <tr>
                        <th className="data-check-cell">
                          <input
                            type="checkbox"
                            aria-label="Seleccionar filas visibles"
                            checked={
                              visible.length > 0 &&
                              visible.every((r) => checked.includes(r.id))
                            }
                            onChange={(e) =>
                              setChecked((c) =>
                                e.target.checked
                                  ? [
                                      ...new Set([
                                        ...c,
                                        ...visible.map((r) => r.id),
                                      ]),
                                    ]
                                  : c.filter(
                                      (id) => !visible.some((r) => r.id === id),
                                    ),
                              )
                            }
                          />
                        </th>
                        {shown.map((c) => (
                          <th
                            key={c.key}
                            aria-sort={
                              sort.key === c.key
                                ? sort.asc
                                  ? "ascending"
                                  : "descending"
                                : undefined
                            }
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(c.key)}
                            >
                              {c.label}
                              <ArrowUpDown size={12} aria-hidden="true" />
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((r) => (
                        <tr key={r.id} aria-selected={checked.includes(r.id)}>
                          <td className="data-check-cell">
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar ${r.name}`}
                              checked={checked.includes(r.id)}
                              onChange={(e) =>
                                setChecked((c) =>
                                  e.target.checked
                                    ? [...c, r.id]
                                    : c.filter((id) => id !== r.id),
                                )
                              }
                            />
                          </td>
                          {shown.map((c) => (
                            <td key={c.key}>
                              {c.key === "risk" && r.risk ? (
                                <RiskBadge risk={r.risk} />
                              ) : typeof c.value(r) === "number" ? (
                                number(c.value(r) as number)
                              ) : (
                                (c.value(r) ?? "—")
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <footer className="data-pagination">
                  <span>
                    Mostrando {(current - 1) * perPage + 1}–
                    {Math.min(current * perPage, filtered.length)} de{" "}
                    {filtered.length}{" "}
                    {applied.level === "municipal"
                      ? "municipios"
                      : applied.level === "national"
                        ? "procesos"
                        : "entidades"}
                  </span>
                  <nav aria-label="Páginas">
                    <button
                      type="button"
                      aria-label="Página anterior"
                      disabled={current === 1}
                      onClick={() => setPage(current - 1)}
                    >
                      <ChevronLeft size={15} />
                    </button>
                    {pageButtons.map((n, i) => (
                      <span key={n}>
                        {i > 0 && n - pageButtons[i - 1] > 1 && (
                          <i aria-hidden="true">…</i>
                        )}
                        <button
                          type="button"
                          aria-current={n === current ? "page" : undefined}
                          onClick={() => setPage(n)}
                        >
                          {n}
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      aria-label="Página siguiente"
                      disabled={current === pages}
                      onClick={() => setPage(current + 1)}
                    >
                      <ChevronRight size={15} />
                    </button>
                  </nav>
                  <DashboardSelect
                    aria-label="Filas por página"
                    value={perPage}
                    onChange={(e) => {
                      setPerPage(Number(e.target.value));
                      setPage(1);
                    }}
                  >
                    <option value={10}>10 por página</option>
                    <option value={20}>20 por página</option>
                    <option value={50}>50 por página</option>
                  </DashboardSelect>
                </footer>
              </>
            )}
          </section>
        </div>

        <div className="data-side">
          <section
            className="section-card data-variable"
            aria-labelledby="variable-title"
          >
            <header className="data-side-heading">
              <BarChart3 aria-hidden="true" />
              <h2 id="variable-title">Detalle de variable</h2>
            </header>
            <label className="data-field">
              <span>Variable</span>
              <DashboardSelect
                aria-label="Variable"
                value={variable}
                onChange={(e) => setVariable(e.target.value)}
              >
                {variables.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </DashboardSelect>
            </label>
            <dl className="data-variable-facts">
              <div>
                <dt>Descripción</dt>
                <dd className="data-variable-description">
                  {info.description}
                </dd>
              </div>
              <div>
                <dt>Fuente</dt>
                <dd>{info.source}</dd>
              </div>
              <div>
                <dt>Cobertura temporal</dt>
                <dd>
                  {variable === "risk"
                    ? "Estimación 2027"
                    : years.length
                      ? `${years[0]} – ${years.at(-1)}`
                      : "—"}
                </dd>
              </div>
              <div>
                <dt>Nivel de desagregación</dt>
                <dd>Estatal (32 entidades)</dd>
              </div>
              <div>
                <dt>Última actualización</dt>
                <dd>{shortDate(forecast?.created_at)}</dd>
              </div>
            </dl>
          </section>
          <section
            className="section-card data-actions"
            aria-labelledby="actions-title"
          >
            <header className="data-side-heading">
              <Settings aria-hidden="true" />
              <h2 id="actions-title">Acciones rápidas</h2>
            </header>
            <ul>
              <li>
                <button type="button" disabled title="Disponible próximamente">
                  <Upload aria-hidden="true" />
                  <span>Subir archivo de datos</span>
                  <em>Próximamente</em>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => coverage.forEach((q) => void q.refetch())}
                >
                  <RotateCcw aria-hidden="true" />
                  <span>Actualizar fuentes</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </li>
              <li>
                <a href="/geo/provenance.json" target="_blank" rel="noreferrer">
                  <MapIcon aria-hidden="true" />
                  <span>Cartografía INEGI</span>
                  <ChevronRight aria-hidden="true" />
                </a>
              </li>
              <li>
                <button type="button" onClick={() => setGlossaryOpen(true)}>
                  <BookOpen aria-hidden="true" />
                  <span>Diccionario de datos</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </li>
            </ul>
          </section>
          <section
            className="section-card data-quality"
            aria-labelledby="quality-title"
          >
            <header className="data-side-heading">
              <Lightbulb aria-hidden="true" />
              <h2 id="quality-title">Calidad de los datos</h2>
            </header>
            <div className="data-quality-body">
              <div
                className="data-quality-ring"
                style={{
                  background: `conic-gradient(#e5007e ${(quality ?? 0) * 360}deg, #fbd3e8 0)`,
                }}
                role="img"
                aria-label={`Registros completos: ${pct(quality, 0)}`}
              >
                <strong>{pct(quality, 0)}</strong>
              </div>
              <div>
                <strong>Registros completos</strong>
                <span>
                  {number(
                    all.filter(
                      (r) =>
                        r.participation_rate != null &&
                        r.abstention_rate != null,
                    ).length,
                  )}{" "}
                  de {number(all.length)} registros
                </span>
                <small>Con SV, NV y tasas calculadas</small>
              </div>
            </div>
          </section>
        </div>
      </div>
      <Dialog.Root open={glossaryOpen} onOpenChange={setGlossaryOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content data-glossary-dialog">
            <Dialog.Title>Diccionario de datos</Dialog.Title>
            <Dialog.Description>
              Cómo se leen los indicadores del tablero.
            </Dialog.Description>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="dialog-close"
                aria-label="Cerrar diccionario"
              >
                <X size={20} />
              </Button>
            </Dialog.Close>
            <dl className="glossary">
              {glossary.map(([term, text]) => (
                <div key={term}>
                  <dt>{term}</dt>
                  <dd>{text}</dd>
                </div>
              ))}
            </dl>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
