"use client";
import { useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileText,
  Info,
  MapPin,
  RotateCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  X,
} from "lucide-react";
import { DashboardSelect } from "./ui/dashboard-select";
import { Chart, chartTooltip } from "./chart";
import { SourceLink, Status } from "./shared";
import { api } from "@/lib/api";
import {
  analysisRates,
  comparableElections,
  participationChange,
} from "@/lib/analysis";
import { number, pct, pp, riskLabels } from "@/lib/utils";
import { quotaSummary, type QuotaInfo } from "@/lib/ai-quota";
import type { AssistantStatus } from "@/lib/assistant";
import type {
  Election,
  Forecast,
  Indicator,
  Prediction,
  Source,
} from "@/lib/types";

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-MX")
    .trim();
const nameOf = (value: string) =>
  value
    .toLocaleLowerCase("es-MX")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-MX"));
const codeOf = (row: Indicator) => row.state_code || row.official_code;
const cell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

type Props = {
  selected: string;
  onSelect: (code: string) => void;
  year: number;
  onYear: (year: number) => void;
  states: Prediction[];
  forecast?: Forecast;
  elections: Election[];
  sources?: Source[];
  loading: boolean;
  error: Error | null;
  retry: () => void;
  onLaboratory: () => void;
};
export function AnalysisView({
  selected,
  onSelect,
  year,
  onYear,
  states,
  forecast,
  elections,
  sources,
  loading,
  error,
  retry,
  onLaboratory,
}: Props) {
  const [mode, setMode] = useState("observed");
  const [startYear, setStartYear] = useState<number | null>(null);
  const [compare, setCompare] = useState("national");
  const [metric, setMetric] = useState("participation");
  const [sort, setSort] = useState("highest");
  const [search, setSearch] = useState("");
  const [stateQuery, setStateQuery] = useState("");
  const [page, setPage] = useState(1);
  const prediction = states.find((state) => state.state_code === selected);
  const territory = prediction ? nameOf(prediction.name) : selected;
  const estimated = mode === "forecast";
  const referenceYear = estimated ? (forecast?.as_of_year ?? year) : year;
  const eligible = comparableElections(elections, referenceYear);
  const forecastElections = elections
    .filter(
      (election) =>
        election.election_type === forecast?.election_type &&
        election.year <= (forecast?.as_of_year ?? year),
    )
    .sort((a, b) => a.year - b.year);
  const comparable = estimated ? forecastElections : eligible;
  const from = estimated
    ? (comparable[0]?.year ?? referenceYear)
    : comparable.some((election) => election.year === startYear)
      ? startYear!
      : (comparable.at(-2)?.year ?? comparable.at(-1)?.year ?? referenceYear);
  const years = (
    estimated
      ? comparable
      : comparable.filter((election) => election.year >= from)
  ).map((election) => election.year);
  const history = useQuery({
    queryKey: ["history", selected],
    queryFn: ({ signal }) => api.history(selected, signal),
  });
  const observed = useQuery({
    queryKey: ["indicators", year],
    queryFn: ({ signal }) => api.indicators(year, signal),
    enabled: !estimated,
  });
  const previous = useQuery({
    queryKey: ["indicators", from],
    queryFn: ({ signal }) => api.indicators(from, signal),
    enabled: !estimated,
  });
  const national = useQueries({
    queries: years.map((current) => ({
      queryKey: ["summary", current],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.summary(current, signal),
      enabled: !estimated && compare === "national",
    })),
  });
  const current = observed.data?.items.find((row) => codeOf(row) === selected);
  const old = previous.data?.items.find((row) => codeOf(row) === selected);
  const rates = estimated
    ? prediction
      ? {
          participation: 1 - prediction.predicted,
          abstention: prediction.predicted,
        }
      : null
    : analysisRates(current);
  const change = estimated ? null : participationChange(current, old);
  const dataError =
    error ??
    history.error ??
    (!estimated ? (observed.error ?? previous.error) : null);
  const pending =
    loading ||
    history.isPending ||
    (!estimated && (observed.isPending || previous.isPending));
  const historyAt = (currentYear: number) =>
    history.data?.items.find(
      (row) =>
        row.year === currentYear &&
        codeOf(row) === selected &&
        row.election_type ===
          comparable.find((election) => election.year === currentYear)
            ?.election_type,
    );
  const seriesRate = (
    row?: Pick<Indicator, "voter_count" | "nonvoter_count">,
  ) => {
    const rate = analysisRates(row);
    return rate
      ? (metric === "participation" ? rate.participation : rate.abstention) *
          100
      : null;
  };
  const rows = (
    estimated
      ? states.map((state) => ({
          code: state.state_code,
          name: nameOf(state.name),
          participation: 1 - state.predicted,
          abstention: state.predicted,
          change: null,
          observed: undefined as Indicator | undefined,
          prediction: state,
        }))
      : (observed.data?.items ?? []).map((row) => ({
          code: codeOf(row),
          name: nameOf(row.name),
          participation: analysisRates(row)?.participation ?? null,
          abstention: analysisRates(row)?.abstention ?? null,
          change: participationChange(
            row,
            previous.data?.items.find((prior) => codeOf(prior) === codeOf(row)),
          ),
          observed: row,
          prediction: undefined as Prediction | undefined,
        }))
  )
    .filter((row) => fold(row.name).includes(fold(search)))
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "es")
        : sort === "lowest"
          ? (a.participation ?? Infinity) - (b.participation ?? Infinity)
          : (b.participation ?? -Infinity) - (a.participation ?? -Infinity),
    );
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const currentPage = Math.min(page, pages);
  const visible = rows.slice((currentPage - 1) * 10, currentPage * 10);
  const labelYear = estimated ? (forecast?.target_year ?? 2027) : year;
  const electionType =
    comparable[0]?.election_type === "midterm"
      ? "Intermedias"
      : "Presidenciales";
  const period = `${from}–${estimated ? (comparable.at(-1)?.year ?? referenceYear) : year}`;
  const summary = estimated
    ? `${territory}: abstención estimada ${pct(rates?.abstention)} para ${labelYear}, con banda ${pct(prediction?.lower)}–${pct(prediction?.upper)}. Es la misma corrida utilizada en Mapa y Predicciones; no es un resultado observado.`
    : `${territory}: participación observada ${pct(rates?.participation)} y abstención ${pct(rates?.abstention)} en ${year}. ${from === year ? "No hay una elección anterior comparable en el periodo." : `Cambio de participación: ${pp(change)} frente a ${from}, del mismo tipo electoral.`}`;
  const context = `${selected}:${mode}:${period}:${forecast?.id ?? ""}`;
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<{
    context: string;
    text: string;
    model?: string;
    quota?: QuotaInfo;
  } | null>(null);
  const [asking, setAsking] = useState(false);
  const queryClient = useQueryClient();
  // Keep the Predictions counter in step: reuse the quota sent by the server, or re-read it.
  const syncQuota = (quota?: QuotaInfo | null) =>
    quota
      ? queryClient.setQueryData<AssistantStatus>(["assistant-status"], (old) =>
          old ? { ...old, quota } : old,
        )
      : queryClient.invalidateQueries({ queryKey: ["assistant-status"] });
  const answer = reply?.context === context ? reply : null;
  const reset = () => {
    setMode("observed");
    setStartYear(null);
    setCompare("national");
    setMetric("participation");
    setSort("highest");
    setSearch("");
    setPage(1);
    setReply(null);
  };
  const refresh = () => {
    retry();
    void history.refetch();
    if (!estimated) {
      void observed.refetch();
      void previous.refetch();
    }
  };
  const exportAnalysis = () => {
    const headings = estimated
      ? [
          "Clave",
          "Entidad",
          "Año estimado",
          "Participación estimada (%)",
          "Abstención estimada (%)",
          "Banda inferior (%)",
          "Banda superior (%)",
          "Riesgo relativo",
          "Corrida",
          "Modelo",
        ]
      : [
          "Clave",
          "Entidad",
          "Año observado",
          "Participación (%)",
          "Abstención (%)",
          `Cambio participación vs ${from} (pp)`,
          "SV",
          "NV",
          "NS",
          "Lista nominal",
          "Fuente ID",
          "Fuente URL",
        ];
    const data = rows.map((row) =>
      estimated
        ? [
            row.code,
            row.name,
            labelYear,
            row.participation == null ? null : row.participation * 100,
            row.abstention == null ? null : row.abstention * 100,
            row.prediction!.lower * 100,
            row.prediction!.upper * 100,
            riskLabels[row.prediction!.risk_level],
            forecast?.id,
            forecast?.provenance.model_name,
          ]
        : [
            row.code,
            row.name,
            year,
            row.participation == null ? null : row.participation * 100,
            row.abstention == null ? null : row.abstention * 100,
            row.change,
            row.observed?.voter_count,
            row.observed?.nonvoter_count,
            row.observed?.unspecified_count,
            row.observed?.nominal_list,
            row.observed?.source_id,
            sources?.find(
              (source) => String(source.id) === String(row.observed?.source_id),
            )?.landing_url,
          ],
    );
    const url = URL.createObjectURL(
      new Blob(
        [
          "\uFEFF" +
            [headings, ...data]
              .map((row) => row.map(cell).join(","))
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `analisis-${estimated ? "estimacion" : "oficial"}-${labelYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const kpis = [
    {
      label: `Participación ${estimated ? "estimada" : "observada"} ${labelYear}`,
      value: pct(rates?.participation),
      icon: TrendingUp,
    },
    {
      label: `Abstención ${estimated ? "estimada" : "observada"} ${labelYear}`,
      value: pct(rates?.abstention),
      icon: Users,
    },
    {
      label: estimated
        ? `Riesgo relativo ${labelYear}`
        : `Cambio participación vs. ${from}`,
      value: estimated
        ? prediction
          ? riskLabels[prediction.risk_level]
          : "—"
        : from === year
          ? "—"
          : pp(change),
      icon: BarChart3,
    },
    {
      label: estimated
        ? `Banda de abstención ${labelYear}`
        : "NS / lista nominal",
      value: estimated
        ? `${pct(prediction?.lower)} – ${pct(prediction?.upper)}`
        : current && current.nominal_list > 0
          ? pct(current.unspecified_count / current.nominal_list)
          : "—",
      icon: MapPin,
    },
  ];
  return (
    <section
      className="analysis-screen"
      aria-label="Análisis de participación electoral"
    >
      <div className="analysis-breadcrumb">
        Inteligencia electoral <span>/</span> Análisis
      </div>
      <div className="analysis-heading">
        <div>
          <div className="analysis-title-line">
            <h1>Entiende la participación <span className="analysis-title-highlight">electoral</span></h1>
            <span className="analysis-chip">
              {estimated ? "Estimación experimental" : "Datos oficiales INE"}
            </span>
          </div>
          <p>
            {territory} ·{" "}
            {estimated ? `Estimación ${labelYear}` : `Observado ${year}`} ·
            Nivel estatal
          </p>
        </div>
        <button
          className="analysis-export"
          onClick={exportAnalysis}
          disabled={pending || !!dataError || !rows.length}
        >
          <Upload size={21} />
          Exportar análisis
        </button>
      </div>
      <div
        className="analysis-filters"
        role="group"
        aria-label="Filtros del análisis"
      >
        <Dialog.Root onOpenChange={() => setStateQuery("")}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              className="analysis-filter-icon"
              aria-label="Buscar estado para el análisis"
              title="Buscar estado"
            >
              <SlidersHorizontal size={19} />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content analysis-question analysis-state-search">
              <Dialog.Title>Buscar estado</Dialog.Title>
              <Dialog.Description>
                Selecciona una de las 32 entidades con datos oficiales. La
                selección se comparte con Mapa y Predicciones.
              </Dialog.Description>
              <label htmlFor="analysis-state-query">Nombre del estado</label>
              <input
                id="analysis-state-query"
                value={stateQuery}
                onChange={(event) => setStateQuery(event.target.value)}
                placeholder="Escribe un estado…"
              />
              <div className="analysis-state-results">
                {states
                  .filter((state) =>
                    fold(state.name).includes(fold(stateQuery)),
                  )
                  .map((state) => (
                    <Dialog.Close asChild key={state.state_code}>
                      <button
                        className="analysis-state-result"
                        onClick={() => onSelect(state.state_code)}
                      >
                        <MapPin size={20} />
                        <span>
                          <strong>{nameOf(state.name)}</strong>
                          <small>Datos estatales oficiales · INE CCPC</small>
                        </span>
                        <span>
                          {state.state_code === selected
                            ? "Actual"
                            : "Seleccionar"}
                        </span>
                      </button>
                    </Dialog.Close>
                  ))}
                {!states.some((state) =>
                  fold(state.name).includes(fold(stateQuery)),
                ) && <p role="status">No encontramos ese estado.</p>}
              </div>
              <Dialog.Close
                className="analysis-dialog-close"
                aria-label="Cerrar búsqueda de estados"
              >
                <X size={20} />
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <div className="analysis-filter-options">
          <DashboardSelect
            aria-label="Territorio del análisis"
            value={selected}
            onChange={(event) => onSelect(event.target.value)}
          >
            {states.map((state) => (
              <option key={state.state_code} value={state.state_code}>
                {nameOf(state.name)}
              </option>
            ))}
          </DashboardSelect>
          <DashboardSelect
            aria-label="Datos del análisis"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value);
              setPage(1);
            }}
          >
            <option value="observed">Histórico observado</option>
            <option value="forecast">Estimación 2027</option>
          </DashboardSelect>
          <DashboardSelect
            aria-label="Año del análisis"
            value={year}
            disabled={estimated || !elections.length}
            onChange={(event) => {
              onYear(Number(event.target.value));
              setStartYear(null);
            }}
          >
            {elections.map((election) => (
              <option key={election.id} value={election.year}>
                {election.year} ·{" "}
                {election.election_type === "midterm"
                  ? "Intermedia"
                  : "Presidencial"}
              </option>
            ))}
          </DashboardSelect>
          <DashboardSelect
            aria-label="Periodo del análisis"
            value={from}
            disabled={estimated || !comparable.length}
            onChange={(event) => setStartYear(Number(event.target.value))}
          >
            {comparable.map((election) => (
              <option key={election.year} value={election.year}>
                Periodo: {election.year} –{" "}
                {estimated ? comparable.at(-1)?.year : year}
              </option>
            ))}
          </DashboardSelect>
          <DashboardSelect
            aria-label="Comparación del análisis"
            value={compare}
            disabled={estimated}
            onChange={(event) => setCompare(event.target.value)}
          >
            <option value="national">Comparar: Nacional ponderado</option>
            <option value="none">Sin comparación</option>
          </DashboardSelect>
          <button
            className="analysis-reset"
            onClick={reset}
            aria-label="Restablecer preferencias del análisis"
            title="Restablecer preferencias"
          >
            <RotateCw size={17} />
          </button>
        </div>
      </div>
      <p className="analysis-disclaimer">
        <Info size={17} />
        {estimated
          ? "Pronóstico estatal experimental: misma corrida que Mapa y Predicciones. No hay una estimación nacional ponderada."
          : `INE CCPC · Tasas sobre SV + NV; NS separado. ${electionType} ${period}. El nacional suma conteos, no promedia tasas estatales.`}{" "}
        Sin detalle municipal homologado.
      </p>
      <Status
        loading={pending}
        error={dataError}
        retry={refresh}
        empty={!pending && !dataError && !rates}
      />
      {!pending && !dataError && rates && (
        <>
          <div className="analysis-kpis">
            {kpis.map(({ label, value, icon: Icon }) => (
              <article key={label} className="analysis-kpi" aria-label={label}>
                <span className="analysis-kpi-icon">
                  <Icon size={27} strokeWidth={1.6} />
                </span>
                <div>
                  <p>{label}</p>
                  <strong>{value}</strong>
                </div>
              </article>
            ))}
          </div>
          <div className="analysis-main-grid">
            <article className="analysis-card analysis-evolution">
              <header>
                <div className="analysis-card-title">
                  <TrendingUp size={19} />
                  <div>
                    <h2>
                      {estimated
                        ? "Histórico y estimación 2027"
                        : "Evolución de la participación"}
                    </h2>
                    <p>
                      {territory} · {electionType}
                      {!estimated && compare === "national"
                        ? " · Nacional ponderado"
                        : ""}
                    </p>
                  </div>
                </div>
                <div
                  className="analysis-metric-switch"
                  aria-label="Métrica de la evolución"
                >
                  <button
                    aria-pressed={metric === "participation"}
                    onClick={() => setMetric("participation")}
                  >
                    Participación
                  </button>
                  <button
                    aria-pressed={metric === "abstention"}
                    onClick={() => setMetric("abstention")}
                  >
                    Abstención
                  </button>
                </div>
              </header>
              <Chart
                height={278}
                label={`${estimated ? "Histórico y estimación" : "Evolución oficial"} de ${metric === "participation" ? "participación" : "abstención"} en ${territory}. ${electionType}; cifras exactas en la tabla histórica.`}
                option={{
                  grid: { left: 44, right: 18, top: 25, bottom: 65 },
                  tooltip: {
                    ...chartTooltip,
                    trigger: "axis",
                    valueFormatter: (value: number) => `${value.toFixed(1)}%`,
                  },
                  xAxis: {
                    type: "category",
                    data: estimated ? [...years, labelYear] : years,
                  },
                  yAxis: {
                    type: "value",
                    min: 0,
                    max: 100,
                    axisLabel: { formatter: "{value}%" },
                  },
                  legend: { bottom: 5, type: "scroll", itemGap: 28, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 12, padding: [0, 8, 0, 4] } },
                  series: [
                    {
                      name: `${territory} · observado`,
                      type: "line",
                      connectNulls: false,
                      data: estimated
                        ? [
                            ...years.map((currentYear) =>
                              seriesRate(historyAt(currentYear)),
                            ),
                            null,
                          ]
                        : years.map((currentYear) =>
                            seriesRate(historyAt(currentYear)),
                          ),
                      itemStyle: { color: "#e5008d" },
                    },
                    ...(estimated
                      ? [
                          {
                            name: "Estimación experimental",
                            type: "line",
                            lineStyle: { type: "dashed" },
                            data: [
                              ...years.map((currentYear, index) =>
                                index === years.length - 1
                                  ? seriesRate(historyAt(currentYear))
                                  : null,
                              ),
                              (metric === "participation"
                                ? rates.participation
                                : rates.abstention) * 100,
                            ],
                            itemStyle: { color: "#e5008d" },
                          },
                        ]
                      : compare === "national"
                        ? [
                            {
                              name: "Nacional ponderado",
                              type: "line",
                              connectNulls: false,
                              data: national.map((query) =>
                                seriesRate(query.data?.items[0]),
                              ),
                              itemStyle: { color: "#74849c" },
                            },
                          ]
                        : []),
                  ],
                }}
              />
              {!estimated &&
                compare === "national" &&
                national.some((query) => query.isError) && (
                  <p role="alert">
                    No se pudo cargar la comparación nacional.{" "}
                    <button
                      onClick={() =>
                        national.forEach((query) => void query.refetch())
                      }
                    >
                      Reintentar comparación
                    </button>
                  </p>
                )}
              <div className="analysis-table-scroll">
                <table aria-label="Histórico oficial del estado y nacional">
                  <thead>
                    <tr>
                      <th>Año</th>
                      <th>Participación estatal</th>
                      <th>Abstención estatal</th>
                      <th>Participación nacional</th>
                      <th>Fuente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((currentYear, index) => {
                      const record = historyAt(currentYear);
                      const rate = analysisRates(record);
                      return (
                        <tr key={currentYear}>
                          <td>{currentYear}</td>
                          <td>{pct(rate?.participation)}</td>
                          <td>{pct(rate?.abstention)}</td>
                          <td>
                            {!estimated && compare === "national"
                              ? pct(
                                  analysisRates(national[index]?.data?.items[0])
                                    ?.participation,
                                )
                              : "—"}
                          </td>
                          <td>
                            <SourceLink
                              id={record?.source_id}
                              sources={sources}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="analysis-card analysis-reading">
              <header>
                <div className="analysis-card-title">
                  <Sparkles size={24} />
                  <h2>Lectura de los datos</h2>
                </div>
                <span className="analysis-chip">Cálculo verificable</span>
              </header>
              <div className="analysis-reading-summary">
                <BarChart3 size={22} />
                <div>
                  <h3>
                    {estimated
                      ? "Estimación seleccionada"
                      : "Resumen del periodo seleccionado"}
                  </h3>
                  <p>{summary}</p>
                </div>
              </div>
              <ol className="analysis-findings">
                <li>
                  <span>1</span>
                  <div>
                    <h3>Fuente común</h3>
                    <p>
                      {estimated
                        ? `Corrida ${forecast?.id ?? "—"}, modelo ${forecast?.provenance.model_name ?? "—"}.`
                        : `${number(current?.voter_count)} votantes (SV) y ${number(current?.nonvoter_count)} no votantes (NV), ${year}.`}
                    </p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <h3>Incertidumbre y comparabilidad</h3>
                    <p>
                      {estimated
                        ? "La banda no garantiza cobertura futura ni certeza del nivel de riesgo."
                        : "Solo se comparan elecciones del mismo tipo. NS no entra en el denominador de las tasas."}
                    </p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <h3>Contexto para interpretar</h3>
                    <p>
                      Estos patrones no demuestran causalidad. No hay cifras
                      municipales en esta vista.
                    </p>
                  </div>
                </li>
              </ol>
              <Dialog.Root>
                <Dialog.Trigger asChild>
                  <button className="analysis-ask">
                    Preguntar a la IA <ArrowUpRight size={16} />
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="dialog-overlay" />
                  <Dialog.Content className="dialog-content analysis-question">
                    <Dialog.Title>Explora esta lectura</Dialog.Title>
                    <Dialog.Description>
                      El asistente consulta el histórico estatal y el pronóstico
                      de la misma entidad. Distingue observaciones de
                      estimaciones y no genera pronósticos nuevos.
                    </Dialog.Description>
                    <p>{summary}</p>
                    <form
                      onSubmit={async (event) => {
                        event.preventDefault();
                        if (asking || !question.trim()) return;
                        setAsking(true);
                        setReply(null);
                        let quota: QuotaInfo | null | undefined;
                        try {
                          const response = await fetch("/api/assistant", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              state_code: selected,
                              messages: [
                                {
                                  role: "user",
                                  content: `Vista: ${estimated ? `estimación ${labelYear}` : `histórico oficial ${period}, ${electionType}`}. Distingue tasas observadas y predicción. ${question.trim()}`,
                                },
                              ],
                            }),
                          });
                          const result = await response.json();
                          quota = result.quota;
                          if (!response.ok)
                            throw new Error(
                              result.detail ?? "No se pudo consultar la IA.",
                            );
                          setReply({
                            context,
                            text: result.answer,
                            model: result.model,
                            quota: result.quota,
                          });
                        } catch (failure) {
                          setReply({
                            context,
                            text:
                              failure instanceof Error
                                ? failure.message
                                : "No se pudo consultar la IA.",
                          });
                        } finally {
                          setAsking(false);
                          syncQuota(quota);
                        }
                      }}
                    >
                      <label>
                        Tu pregunta
                        <input
                          value={question}
                          onChange={(event) => setQuestion(event.target.value)}
                          placeholder="Pregunta sobre esta entidad…"
                          required
                          maxLength={2000}
                        />
                      </label>
                      <button
                        className="analysis-export"
                        type="submit"
                        disabled={asking || !question.trim()}
                      >
                        {asking ? "Consultando…" : "Consultar a la IA"}
                      </button>
                    </form>
                    {answer && (
                      <div role="status" aria-label="Respuesta del asistente de IA">
                        <p>{answer.text}</p>
                        {answer.model && <small>IA · {answer.model}</small>}
                        {answer.quota && (
                          <small className="ai-quota">
                            {quotaSummary(answer.quota)}
                          </small>
                        )}
                      </div>
                    )}
                    <button className="analysis-ask" onClick={onLaboratory}>
                      Abrir laboratorio de modelos <ArrowUpRight size={15} />
                    </button>
                    <Dialog.Close
                      className="analysis-dialog-close"
                      aria-label="Cerrar lectura"
                    >
                      <X size={18} />
                    </Dialog.Close>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </article>
          </div>
          <div className="analysis-bottom-grid">
            <article className="analysis-card analysis-comparison">
              <header>
                <div className="analysis-card-title">
                  <BarChart3 size={19} />
                  <h2>Comparativa estatal {labelYear}</h2>
                </div>
                <DashboardSelect
                  aria-label="Orden de participación"
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="highest">Mayor participación</option>
                  <option value="lowest">Menor participación</option>
                  <option value="name">Nombre del estado</option>
                </DashboardSelect>
              </header>
              <div className="analysis-bars">
                {rows.slice(0, 5).map((row) => (
                  <div key={row.code}>
                    <button
                      onClick={() => onSelect(row.code)}
                      aria-label={`Analizar ${row.name}`}
                    >
                      {row.name}
                    </button>
                    <div>
                      <i
                        style={{ width: `${(row.participation ?? 0) * 100}%` }}
                      />
                    </div>
                    <strong>{pct(row.participation)}</strong>
                  </div>
                ))}
              </div>
              <p className="section-card-note">
                Primeras cinco entidades del orden elegido.{" "}
                {estimated
                  ? "Estimaciones experimentales."
                  : "Tasas observadas del INE."}
              </p>
            </article>
            <article className="analysis-card analysis-details">
              <header>
                <div className="analysis-card-title">
                  <FileText size={18} />
                  <h2>Detalle estatal {labelYear}</h2>
                </div>
                <label className="analysis-search">
                  <Search size={15} />
                  <input
                    aria-label="Buscar estado del análisis"
                    placeholder="Buscar estado…"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </header>
              <div className="analysis-table-scroll">
                <table
                  aria-label={`Detalle estatal ${estimated ? "estimado" : "observado"} ${labelYear}`}
                >
                  <thead>
                    <tr>
                      <th>Estado</th>
                      <th>Participación</th>
                      <th>Abstención</th>
                      <th>
                        {estimated
                          ? "Banda de abstención"
                          : `Cambio vs. ${from}`}
                      </th>
                      <th>{estimated ? "Riesgo relativo" : "Fuente"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr key={row.code} aria-selected={row.code === selected}>
                        <td>
                          <button onClick={() => onSelect(row.code)}>
                            {row.name}
                          </button>
                        </td>
                        <td>{pct(row.participation)}</td>
                        <td>{pct(row.abstention)}</td>
                        <td>
                          {estimated
                            ? `${pct(row.prediction?.lower)} – ${pct(row.prediction?.upper)}`
                            : from === year
                              ? "—"
                              : pp(row.change)}
                        </td>
                        <td>
                          {estimated ? (
                            row.prediction ? (
                              riskLabels[row.prediction.risk_level]
                            ) : (
                              "—"
                            )
                          ) : (
                            <SourceLink
                              id={row.observed?.source_id}
                              sources={sources}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length && (
                  <p className="analysis-empty">
                    No hay estados que coincidan con la búsqueda.
                  </p>
                )}
              </div>
              <footer>
                <span>
                  {rows.length} entidades ·{" "}
                  {estimated ? "Estimación experimental" : "INE CCPC oficial"}
                </span>
                <div>
                  <button
                    aria-label="Página anterior"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span>
                    {currentPage} / {pages}
                  </span>
                  <button
                    aria-label="Página siguiente"
                    disabled={currentPage === pages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              </footer>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
