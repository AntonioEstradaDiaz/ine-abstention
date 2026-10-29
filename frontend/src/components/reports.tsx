"use client";
import { useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  ChartPie,
  ChevronRight,
  Clock,
  Download,
  Eye,
  FileText,
  Layers,
  LineChart,
  MapPin,
  MoreVertical,
  Plus,
  ScrollText,
  ShieldAlert,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  downloadStateReport,
  type ReportFormat,
  type StateReport,
} from "@/lib/report-export";
import type { Election, Forecast, Prediction, Risk } from "@/lib/types";
import { pct, pp, riskLabels } from "@/lib/utils";
import { Chart, chartAxis, chartTooltip } from "./chart";
import { RepublicMap } from "./republic-map";
import { Status } from "./shared";
import { Button } from "./ui/button";
import { DashboardSelect } from "./ui/dashboard-select";

const templates = [
  {
    id: "executive",
    icon: FileText,
    title: "Resumen ejecutivo",
    text: "Panorama general y principales hallazgos.",
  },
  {
    id: "territorial",
    icon: BarChart3,
    title: "Análisis por entidad",
    text: "Diagnóstico detallado de una entidad.",
  },
  {
    id: "national",
    icon: TrendingUp,
    title: "Comparativo nacional",
    text: "Comparación entre entidades.",
  },
  {
    id: "municipal",
    icon: MapPin,
    title: "Reporte municipal",
    text: "Análisis a nivel municipal (ilustrativo).",
  },
  {
    id: "scenarios",
    icon: Target,
    title: "Escenarios de participación",
    text: "Cambios hipotéticos sobre la estimación base.",
  },
];
const sections = [
  { id: "summary", label: "Resumen ejecutivo" },
  { id: "charts", label: "Gráficas y visualizaciones" },
  { id: "factors", label: "Análisis de factores" },
  { id: "notes", label: "Notas metodológicas" },
];
const schedules = [
  { title: "Reporte semanal nacional", when: "Todos los lunes, 8:00 AM" },
  { title: "Reporte mensual por entidad", when: "Día 1 de cada mes" },
  { title: "Entidades en riesgo alto", when: "Cada 15 días" },
];
const riskPalette: Record<Risk, string> = {
  high: "#c00063",
  medium: "#f45ca9",
  low: "#f7b6d7",
};
const titleCase = (name: string) =>
  name
    .toLocaleLowerCase("es-MX")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-MX"));
type Recent = {
  name: string;
  entity: string;
  date: string;
  format: ReportFormat;
  report: StateReport;
};

export function Reports({
  states,
  forecast,
  elections,
  selected,
  year,
  loading,
  error,
  retry,
}: {
  states: Prediction[];
  forecast?: Forecast;
  elections: Election[];
  selected: string;
  year: number;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}) {
  const [template, setTemplate] = useState("territorial");
  const [level, setLevel] = useState("state");
  const [code, setCode] = useState(selected);
  const [variable, setVariable] = useState("abstention");
  const [compare, setCompare] = useState("national");
  const [included, setIncluded] = useState(["summary", "charts", "notes"]);
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [generating, setGenerating] = useState(false);
  const [exportError, setExportError] = useState("");
  const [recent, setRecent] = useState<Recent[]>([]);
  const history = useQuery({
    queryKey: ["history", code],
    queryFn: ({ signal }) => api.history(code, signal),
  });
  const national = useQueries({
    queries: elections.map((e) => ({
      queryKey: ["summary", e.year],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.summary(e.year, signal),
      enabled: compare === "national",
    })),
  });
  if (loading || error || !states.length)
    return (
      <Status
        loading={loading}
        error={error}
        empty={!loading && !error}
        retry={retry}
      />
    );
  const state = states.find((s) => s.state_code === code) ?? states[0];
  const name = titleCase(state.name);
  const sorted = [...states].sort((a, b) => b.predicted - a.predicted);
  const rank = sorted.findIndex((s) => s.state_code === state.state_code) + 1;
  const counts = (["high", "medium", "low"] as Risk[]).map((risk) => ({
    risk,
    count: states.filter((s) => s.risk_level === risk).length,
  }));
  const risks = Object.fromEntries(
    states.map((s) => [s.state_code, s.risk_level]),
  );
  // The report covers elections up to the process chosen in the header.
  const rows = (history.data?.items ?? [])
    .filter((r) => r.year <= year)
    .sort((a, b) => a.year - b.year);
  const rateOf = (r: {
    abstention_rate: number | null;
    participation_rate: number | null;
  }) =>
    (variable === "abstention" ? r.abstention_rate : r.participation_rate) ??
    null;
  const last2021 = rows.find((r) => r.year === 2021);
  const context = state.explanation.context_only;
  const findings = [
    `La abstención estimada para 2027 en ${name} es ${pct(state.predicted)}, con riesgo ${riskLabels[state.risk_level].toLowerCase()}.`,
    `Ocupa el lugar ${rank} de ${states.length} entidades por abstención estimada.`,
    `La tendencia descriptiva de su abstención es ${pp(context.abstention_trend_pp_per_year)} por año.`,
    `La banda de referencia va de ${pct(state.lower)} a ${pct(state.upper)}; no garantiza cobertura.`,
  ];
  const chart = {
    tooltip: {
      ...chartTooltip,
      valueFormatter: (v: number) => `${Number(v).toFixed(1)}%`,
    },
    legend: {
      bottom: 0,
      icon: "circle",
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: "#596D8D", fontSize: 10 },
    },
    grid: { left: 34, right: 22, top: 24, bottom: 40 },
    xAxis: {
      ...chartAxis,
      type: "category",
      boundaryGap: false,
      data: rows.map((r) => r.year),
      axisLabel: { color: "#596D8D", fontSize: 10 },
    },
    yAxis: {
      ...chartAxis,
      type: "value",
      min: 0,
      max: 100,
      interval: 20,
      axisLabel: { color: "#596D8D", fontSize: 10, formatter: "{value}%" },
    },
    series: [
      ...(["midterm", "presidential"] as const).map((type) => ({
        name: `${name} · ${type === "midterm" ? "Intermedia" : "Presidencial"}`,
        type: "line",
        connectNulls: true,
        symbolSize: 7,
        itemStyle: { color: "#e5007e" },
        areaStyle: { color: "rgba(229,0,126,0.08)" },
        markLine:
          type === "midterm"
            ? {
                silent: true,
                symbol: "none",
                lineStyle: { color: "#b9005e", type: "dashed", width: 1 },
                label: {
                  formatter: String(year),
                  color: "#b9005e",
                  fontSize: 9,
                },
                data: rows.some((r) => r.year === year)
                  ? [{ xAxis: rows.findIndex((r) => r.year === year) }]
                  : [],
              }
            : undefined,
        data: rows.map((r) => {
          const v = rateOf(r);
          return r.election_type !== type || v == null ? null : v * 100;
        }),
      })),
      ...(compare === "national"
        ? (["midterm", "presidential"] as const).map((type) => ({
            name: `Nacional · ${type === "midterm" ? "Intermedia" : "Presidencial"}`,
            type: "line",
            connectNulls: true,
            symbolSize: 5,
            itemStyle: { color: "#83909f" },
            lineStyle: { type: "dashed" },
            data: rows.map((r) => {
              const n = national.find((q) => q.data?.items[0]?.year === r.year)
                ?.data?.items[0];
              const v = n ? rateOf(n) : null;
              return r.election_type !== type || v == null ? null : v * 100;
            }),
          }))
        : []),
    ],
  };
  const donut = {
    tooltip: { trigger: "item", formatter: "{b}: {c} entidades ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["62%", "92%"],
        label: { show: false },
        data: counts.map((c) => ({
          name: riskLabels[c.risk],
          value: c.count,
          itemStyle: { color: riskPalette[c.risk] },
        })),
      },
    ],
  };
  const exportReady =
    !!forecast &&
    history.isSuccess &&
    rows.length > 0 &&
    (compare !== "national" || national.every((q) => q.isSuccess));
  const generate = async () => {
    if (!forecast || !exportReady || generating) return;
    const report: StateReport = {
      title:
        templates.find((t) => t.id === template)?.title ?? "Reporte estatal",
      state,
      forecast,
      history: rows,
      national:
        compare === "national"
          ? national
              .flatMap((q) => q.data?.items ?? [])
              .map((n) => ({
                year: n.year,
                participation_rate: n.participation_rate,
                abstention_rate: n.abstention_rate,
              }))
          : [],
      variable,
      summary: included.includes("summary") ? findings : [],
      charts: included.includes("charts"),
      createdAt: new Date().toISOString(),
    };
    setGenerating(true);
    setExportError("");
    try {
      await downloadStateReport(report, format);
      setRecent((r) =>
        [
          {
            name: `${templates.find((t) => t.id === template)?.title} · ${name}`,
            entity: level === "national" ? "Nacional" : name,
            date: new Date().toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
            format,
            report,
          },
          ...r,
        ].slice(0, 5),
      );
    } catch {
      setExportError("No se pudo generar el archivo. Vuelve a intentar.");
    } finally {
      setGenerating(false);
    }
  };
  const downloadRecent = async (item: Recent) => {
    setGenerating(true);
    setExportError("");
    try {
      await downloadStateReport(item.report, item.format);
    } catch {
      setExportError("No se pudo descargar el archivo. Vuelve a intentar.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="section-page reports-page">
      <div className="reports-layout">
        <aside
          className="section-card report-config"
          aria-labelledby="report-config-title"
        >
          <header className="section-card-heading">
            <FileText className="section-card-icon" aria-hidden="true" />
            <div>
              <h2 id="report-config-title">Configura tu reporte</h2>
              <p>Descarga un reporte estatal con datos y procedencia.</p>
            </div>
          </header>
          <label className="data-field">
            <span>Tipo de reporte</span>
            <DashboardSelect
              aria-label="Tipo de reporte"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {templates.map((t) => (
                <option
                  key={t.id}
                  value={t.id}
                  disabled={
                    t.id === "national" ||
                    t.id === "municipal" ||
                    t.id === "scenarios"
                  }
                >
                  {t.title}
                </option>
              ))}
            </DashboardSelect>
          </label>
          <div className="data-field">
            <span>Nivel geográfico</span>
            <div
              className="report-segmented"
              role="group"
              aria-label="Nivel geográfico"
            >
              {[
                ["national", "Nacional"],
                ["state", "Estatal"],
                ["municipal", "Municipal"],
              ].map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  aria-pressed={level === id}
                  disabled={id !== "state"}
                  title={
                    id !== "state" ? "Pendiente de implementación" : undefined
                  }
                  onClick={() => setLevel(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="section-card-note">
              Los reportes nacionales y municipales están pendientes. Estas
              cifras corresponden a la entidad elegida.
            </p>
          </div>
          <label className="data-field">
            <span>Entidad</span>
            <DashboardSelect
              aria-label="Entidad del reporte"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            >
              {[...states]
                .sort((a, b) => a.name.localeCompare(b.name, "es"))
                .map((s) => (
                  <option key={s.state_code} value={s.state_code}>
                    {titleCase(s.name)}
                  </option>
                ))}
            </DashboardSelect>
          </label>
          <label className="data-field">
            <span>Variable principal</span>
            <DashboardSelect
              aria-label="Variable principal"
              value={variable}
              onChange={(e) => setVariable(e.target.value)}
            >
              <option value="abstention">Tasa de abstención</option>
              <option value="participation">Tasa de participación</option>
            </DashboardSelect>
          </label>
          <label className="data-field">
            <span>Comparar con</span>
            <DashboardSelect
              aria-label="Comparar con"
              value={compare}
              onChange={(e) => setCompare(e.target.value)}
            >
              <option value="national">Promedio nacional</option>
              <option value="none">Sin comparación</option>
            </DashboardSelect>
          </label>
          <fieldset>
            <legend>Incluir secciones</legend>
            {sections.map((s) => (
              <label key={s.id} className="data-check">
                <input
                  type="checkbox"
                  checked={included.includes(s.id)}
                  disabled={s.id === "factors" || s.id === "notes"}
                  onChange={(e) =>
                    setIncluded((list) =>
                      e.target.checked
                        ? [...list, s.id]
                        : list.filter((x) => x !== s.id),
                    )
                  }
                />
                <span>
                  {s.label}
                  {s.id === "factors"
                    ? " · Próximamente"
                    : s.id === "notes"
                      ? " · Siempre incluidas"
                      : ""}
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Formato de descarga</legend>
            {[
              ["pdf", "PDF (recomendado)"],
              ["pptx", "PowerPoint"],
              ["xlsx", "Excel"],
            ].map(([id, label]) => (
              <label key={id} className="data-radio">
                <input
                  type="radio"
                  name="report-format"
                  checked={format === id}
                  disabled={id === "pptx" || generating}
                  onChange={() => {
                    if (id === "pdf" || id === "xlsx") setFormat(id);
                  }}
                />
                <span>
                  {label}
                  {id === "pptx" ? " · Próximamente" : ""}
                </span>
              </label>
            ))}
          </fieldset>
          <Button
            className="report-generate"
            onClick={() => void generate()}
            disabled={!exportReady || generating}
          >
            <FileText size={16} />
            {generating ? "Generando…" : "Descargar reporte"}
          </Button>
          <p className="section-card-note">
            PDF incluye gráficas si las seleccionas. Excel incluye tablas
            numéricas, conteos y metodología. Las notas metodológicas se
            incluyen siempre.
          </p>
          {!exportReady && (
            <p role="status">
              Esperando datos completos del histórico y la comparación.
            </p>
          )}
          {(history.error || national.some((q) => q.error)) && (
            <p role="alert">
              No se pudieron cargar todos los datos. Cambia la comparación o
              vuelve a cargar la sección.
            </p>
          )}
          {exportError && <p role="alert">{exportError}</p>}
        </aside>

        <section
          className="section-card report-preview"
          aria-labelledby="report-preview-title"
        >
          <header className="section-card-heading">
            <Eye className="section-card-icon" aria-hidden="true" />
            <div>
              <h2 id="report-preview-title">Vista previa del reporte</h2>
              <p>
                Contenido estatal. La descarga incluye histórico y metodología.
              </p>
            </div>
          </header>
          <article className="report-document">
            <div className="report-cover">
              <div className="report-cover-text">
                <img
                  src="/design-top/logo-ine.png"
                  alt="INE · Instituto Nacional Electoral"
                  className="report-logo"
                  width={2172}
                  height={724}
                />
                <span className="report-process">Proceso Electoral {year}</span>
                <h3>
                  {level === "national"
                    ? "Reporte comparativo nacional"
                    : "Reporte de análisis territorial"}
                </h3>
                <strong className="report-state">
                  {level === "national" ? "México" : name}
                </strong>
                <p>
                  {variable === "abstention" ? "Abstención" : "Participación"}{" "}
                  electoral: diagnóstico y perspectivas
                </p>
                <i aria-hidden="true" />
              </div>
              <RepublicMap
                risks={risks}
                selected={state.state_code}
                focus={level !== "national"}
                label={`Mapa de ${level === "national" ? "México" : name} con el nivel de riesgo de abstención estimado`}
                className="report-map"
              />
            </div>
            {level === "municipal" && (
              <p className="data-illustrative">
                <strong>Nivel municipal ilustrativo.</strong> Las cifras de la
                vista previa son estatales; el detalle municipal oficial aún no
                está homologado.
              </p>
            )}
            <div className="report-kpis">
              {[
                {
                  icon: Users,
                  label: "Participación estimada",
                  value: pct(1 - state.predicted),
                  note: last2021
                    ? `${pp(Number(((1 - state.predicted - (last2021.participation_rate ?? 0)) * 100).toFixed(1)))} vs. 2021`
                    : "Estimación 2027",
                },
                {
                  icon: ShieldAlert,
                  label: "Abstención estimada",
                  value: pct(state.predicted),
                  note: `Riesgo ${riskLabels[state.risk_level].toLowerCase()}`,
                },
                {
                  icon: BarChart3,
                  label: "Entidades en riesgo alto",
                  value: `${counts[0].count} de ${states.length}`,
                  note: `${pct(counts[0].count / states.length)} del total`,
                },
                {
                  icon: Users,
                  label: "No votantes en 2021",
                  value: `${(state.explanation.nonvoter_count / 1_000_000).toFixed(2)} M`,
                  note: "Base de la estimación",
                },
              ].map((k) => (
                <div key={k.label}>
                  <span aria-hidden="true">
                    <k.icon />
                  </span>
                  <div>
                    <small>{k.label}</small>
                    <strong>{k.value}</strong>
                    <em>{k.note}</em>
                  </div>
                </div>
              ))}
            </div>
            {included.includes("charts") && (
              <div className="report-charts">
                <section aria-labelledby="report-evolution-title">
                  <header>
                    <LineChart aria-hidden="true" />
                    <div>
                      <h4 id="report-evolution-title">
                        Evolución histórica de la{" "}
                        {variable === "abstention"
                          ? "abstención"
                          : "participación"}
                      </h4>
                      <p>
                        {name} ({rows[0]?.year ?? "—"} –{" "}
                        {rows.at(-1)?.year ?? "—"})
                      </p>
                    </div>
                  </header>
                  <Status
                    loading={history.isPending}
                    error={history.error}
                    retry={() => void history.refetch()}
                  />
                  {history.isSuccess && (
                    <Chart
                      option={chart}
                      label={`Evolución de la ${variable === "abstention" ? "abstención" : "participación"} en ${name}`}
                      height={200}
                    />
                  )}
                </section>
                <section aria-labelledby="report-distribution-title">
                  <header>
                    <ChartPie aria-hidden="true" />
                    <div>
                      <h4 id="report-distribution-title">
                        Distribución nacional del riesgo
                      </h4>
                      <p>Entidades por nivel de riesgo 2027</p>
                    </div>
                  </header>
                  <div className="report-donut">
                    <div>
                      <Chart
                        option={donut}
                        label={`Entidades por riesgo: ${counts.map((c) => `${riskLabels[c.risk]} ${c.count}`).join(", ")}`}
                        height={160}
                      />
                      <span>
                        <strong>{states.length}</strong>
                        Entidades
                      </span>
                    </div>
                    <ul>
                      {counts.map((c) => (
                        <li key={c.risk}>
                          <i style={{ background: riskPalette[c.risk] }} />
                          <span>{riskLabels[c.risk]}</span>
                          <strong>
                            {c.count} ({pct(c.count / states.length)})
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              </div>
            )}
            {included.includes("summary") && (
              <section
                className="report-findings"
                aria-labelledby="report-findings-title"
              >
                <header>
                  <ScrollText aria-hidden="true" />
                  <h4 id="report-findings-title">Principales hallazgos</h4>
                </header>
                <ol>
                  {findings.map((f, i) => (
                    <li key={i}>
                      <span>{i + 1}</span>
                      <p>{f}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </article>
        </section>

        <div className="report-side">
          <section
            className="section-card report-templates"
            aria-labelledby="templates-title"
          >
            <header className="section-card-heading">
              <Layers className="section-card-icon" aria-hidden="true" />
              <div>
                <h2 id="templates-title">Plantillas de reportes</h2>
                <p>Utiliza plantillas prediseñadas según tus necesidades.</p>
              </div>
            </header>
            <ul>
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-pressed={template === t.id}
                    disabled={
                      t.id === "national" ||
                      t.id === "municipal" ||
                      t.id === "scenarios"
                    }
                    onClick={() => {
                      setTemplate(t.id);
                      if (t.id === "national") setLevel("national");
                      if (t.id === "municipal") setLevel("municipal");
                      if (t.id === "territorial") setLevel("state");
                    }}
                  >
                    <span aria-hidden="true">
                      <t.icon />
                    </span>
                    <div>
                      <strong>{t.title}</strong>
                      <small>
                        {t.text}
                        {t.id === "national" ||
                        t.id === "municipal" ||
                        t.id === "scenarios"
                          ? " Próximamente."
                          : ""}
                      </small>
                    </div>
                    <ChevronRight aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section
            className="section-card report-schedules"
            aria-labelledby="schedules-title"
          >
            <header className="section-card-heading">
              <CalendarClock className="section-card-icon" aria-hidden="true" />
              <div>
                <h2 id="schedules-title">Reportes programados</h2>
                <p>Automatiza la generación y envío de reportes.</p>
              </div>
              <button type="button" className="report-new" disabled>
                <Plus size={13} />
                Nuevo
              </button>
            </header>
            <ul>
              {schedules.map((s) => (
                <li key={s.title}>
                  <CalendarClock aria-hidden="true" />
                  <div>
                    <strong>{s.title}</strong>
                    <small>{s.when}</small>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={false}
                    aria-label={`Activar ${s.title}`}
                    className="report-switch"
                    disabled
                  >
                    <i />
                  </button>
                  <MoreVertical className="report-more" aria-hidden="true" />
                </li>
              ))}
            </ul>
            <p className="section-card-note">
              Vista de diseño · aún no se envían reportes automáticos.
            </p>
          </section>
          <section
            className="section-card report-recent"
            aria-labelledby="recent-title"
          >
            <header className="section-card-heading">
              <Clock className="section-card-icon" aria-hidden="true" />
              <div>
                <h2 id="recent-title">Reportes de esta sesión</h2>
                <p>
                  Descarga de nuevo los últimos cinco reportes. Este listado se
                  reinicia al salir de la sección.
                </p>
              </div>
            </header>
            {recent.length ? (
              <table className="section-table compact">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Entidad</th>
                    <th>Fecha</th>
                    <th>Descarga</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td>{r.entity}</td>
                      <td>{r.date}</td>
                      <td>
                        <span className="report-format" data-format={r.format}>
                          {r.format.toUpperCase()}
                        </span>
                        <Button
                          variant="outline"
                          disabled={generating}
                          onClick={() => void downloadRecent(r)}
                          aria-label={`Descargar ${r.name} en ${r.format.toUpperCase()}`}
                        >
                          <Download size={16} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="report-empty">
                <SlidersHorizontal aria-hidden="true" />
                Aún no generas reportes. Configura uno y pulsa “Descargar
                reporte”.
              </p>
            )}
          </section>
        </div>
      </div>
      <p className="section-card-note">
        Corrida {forecast?.id ?? "—"} · Las estimaciones 2027 son experimentales
        y no son un producto oficial del INE.
      </p>
    </div>
  );
}
