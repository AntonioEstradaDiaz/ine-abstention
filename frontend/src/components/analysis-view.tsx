"use client";
import { useMemo, useState } from "react";
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
const demo = {
  Guerrero: {
    rates: [58.4, 54, 60.8],
    count: 85,
    names: ["Chilpancingo", "Iguala", "Taxco", "Acapulco", "Chilapa"],
    values: [65.2, 63.1, 61.4, 58.6, 56.8],
    changes: [3.1, 2.8, 1.9, 1.9, 0.6],
  },
  Morelos: {
    rates: [62.5, 57.8, 64.1],
    count: 36,
    names: ["Cuernavaca", "Jiutepec", "Cuautla", "Temixco", "Yautepec"],
    values: [67.2, 65.1, 63.8, 61.4, 59.6],
    changes: [2.8, 2.5, 1.6, 1.4, 0.8],
  },
  "Baja California": {
    rates: [52.7, 48.2, 55.1],
    count: 7,
    names: ["Mexicali", "Ensenada", "Tecate", "Tijuana", "Playas de Rosarito"],
    values: [59.5, 57.8, 55.2, 52.4, 50.6],
    changes: [3.2, 2.1, 1.8, 2.5, 0.9],
  },
};
type Territory = keyof typeof demo;
const years = [2018, 2021, 2024];
const percent = (n: number) => `${n.toFixed(1)}%`;
const points = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)} pp`;
export function AnalysisView({ onLaboratory }: { onLaboratory: () => void }) {
  const [stateQuery, setStateQuery] = useState("");
  const [territory, setTerritory] = useState<Territory>("Guerrero");
  const [period, setPeriod] = useState("2018-2024");
  const [level, setLevel] = useState("municipality");
  const [compare, setCompare] = useState("national");
  const [metric, setMetric] = useState("participation");
  const [sort, setSort] = useState("highest");
  const [search, setSearch] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const data = demo[territory];
  const [from, to] = period.split("-").map(Number);
  const indices = years
    .map((year, i) => ({ year, i }))
    .filter((x) => x.year >= from && x.year <= to);
  const first = indices[0].i,
    last = indices.at(-1)!.i;
  const participation = data.rates[last],
    abstention = 100 - participation,
    change = participation - data.rates[first];
  const rows = useMemo(() => {
    const source =
      level === "state"
        ? [{ name: territory, value: participation, change }]
        : data.names.map((name, i) => ({
            name,
            value:
              last === 2
                ? data.values[i]
                : data.values[i] - (last === 0 ? data.changes[i] : 6.8),
            change: period === "2018-2024" ? data.changes[i] : change,
          }));
    return source
      .filter((row) =>
        row.name
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase()
          .includes(
            search
              .normalize("NFD")
              .replace(/\p{Diacritic}/gu, "")
              .toLowerCase(),
          ),
      )
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name, "es")
          : sort === "lowest"
            ? a.value - b.value
            : b.value - a.value,
      );
  }, [
    data,
    territory,
    participation,
    change,
    level,
    last,
    period,
    search,
    sort,
  ]);
  const national = [52, 52, 61];
  const chartValues = indices.map((x) =>
    metric === "participation" ? data.rates[x.i] : 100 - data.rates[x.i],
  );
  const referenceValues = indices.map((x) =>
    metric === "participation" ? national[x.i] : 100 - national[x.i],
  );
  const reset = () => {
    setTerritory("Guerrero");
    setPeriod("2018-2024");
    setLevel("municipality");
    setCompare("national");
    setMetric("participation");
    setSort("highest");
    setSearch("");
  };
  const exportAnalysis = () => {
    const lines = [
      "Datos ilustrativos; no son estadísticas oficiales",
      `Territorio,${territory}`,
      `Periodo,${from}-${to}`,
      "Municipio,Participación,Abstención,Cambio (pp)",
      ...rows.map(
        (r) =>
          `${r.name},${r.value.toFixed(1)},${(100 - r.value).toFixed(1)},${r.change.toFixed(1)}`,
      ),
    ];
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `analisis-ilustrativo-${territory.toLowerCase().replaceAll(" ", "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const closer =
    Math.abs(participation - national[last]) <=
    Math.abs(data.rates[first] - national[first]);
  const summary = `La participación en ${territory} ${change >= 0 ? "aumentó" : "disminuyó"} ${Math.abs(change).toFixed(1)} puntos respecto a ${from}${compare === "national" ? `, ${closer ? "acercándose al" : "alejándose del"} promedio nacional` : ""}.`;
  const kpis = [
    {
      label: "Participación",
      value: percent(participation),
      icon: TrendingUp,
      trend: "line",
    },
    {
      label: "Abstención",
      value: percent(abstention),
      icon: Users,
      trend: "down",
    },
    {
      label: `Cambio vs. ${from}`,
      value: points(change),
      icon: BarChart3,
      trend: "green",
    },
    {
      label: level === "municipality" ? "Municipios" : "Entidades",
      value: level === "municipality" ? String(data.count) : "1",
      icon: MapPin,
      trend: "bars",
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
            <h1>Entiende la participación electoral</h1>
            <span className="analysis-chip">Datos ilustrativos</span>
          </div>
          <p>Explora tendencias y descubre qué cambia entre territorios.</p>
        </div>
        <button className="analysis-export" onClick={exportAnalysis}>
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
            <button type="button" className="analysis-filter-icon" aria-label="Buscar estado para el análisis" title="Buscar estado">
              <SlidersHorizontal size={19} aria-hidden="true" />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content analysis-question analysis-state-search">
              <Dialog.Title>Buscar estado</Dialog.Title>
              <Dialog.Description>Selecciona un estado para actualizar las métricas, la gráfica y el detalle municipal. Esta muestra contiene tres estados con datos ilustrativos.</Dialog.Description>
              <label htmlFor="analysis-state-query">Nombre del estado</label>
              <input id="analysis-state-query" placeholder="Escribe un estado…" value={stateQuery} onChange={(event) => setStateQuery(event.target.value)} autoComplete="off" />
              <div className="analysis-state-results" aria-live="polite">
                {(Object.keys(demo) as Territory[]).filter((name) => name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().includes(stateQuery.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim())).map((name) => (
                  <Dialog.Close asChild key={name}>
                    <button type="button" className="analysis-state-result" onClick={() => { setTerritory(name); setSearch(""); setAnswer(""); }}>
                      <MapPin size={20} aria-hidden="true" />
                      <span><strong>{name}</strong><small>{demo[name].count} municipios · Datos ilustrativos</small></span>
                      <span className="analysis-state-action">{territory === name ? "Actual" : "Seleccionar"}</span>
                    </button>
                  </Dialog.Close>
                ))}
                {!(Object.keys(demo)).some((name) => name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().includes(stateQuery.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim())) && <p role="status">No hay datos para ese estado en esta muestra. Prueba Guerrero, Morelos o Baja California.</p>}
              </div>
              <Dialog.Close asChild><button className="analysis-dialog-close" aria-label="Cerrar búsqueda de estados"><X size={20} /></button></Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <div className="analysis-filter-options">
        <DashboardSelect
          aria-label="Territorio del análisis"
          value={territory}
          onChange={(e) => setTerritory(e.target.value as Territory)}
        >
          {Object.keys(demo).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </DashboardSelect>
        <DashboardSelect
          aria-label="Periodo del análisis"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          <option value="2018-2024">Periodo: 2018 – 2024</option>
          <option value="2021-2024">Periodo: 2021 – 2024</option>
          <option value="2018-2021">Periodo: 2018 – 2021</option>
        </DashboardSelect>
        <DashboardSelect
          aria-label="Nivel del análisis"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="municipality">Nivel: Municipio</option>
          <option value="state">Nivel: Estado</option>
        </DashboardSelect>
        <DashboardSelect
          aria-label="Comparación del análisis"
          value={compare}
          onChange={(e) => setCompare(e.target.value)}
        >
          <option value="national">Comparar: Nacional</option>
          <option value="none">Sin comparación</option>
        </DashboardSelect>
        <button className="analysis-reset" onClick={reset}>
          <span>
            <RotateCw size={17} />
          </span>
          <u>Restablecer</u>
        </button>
        </div>
      </div>
      <div className="analysis-kpis">
        {kpis.map(({ label, value, icon: Icon, trend }) => (
          <article key={label} className="analysis-kpi">
            <span className="analysis-kpi-icon">
              <Icon size={27} strokeWidth={1.6} />
            </span>
            <div>
              <p>{label}</p>
              <strong className={trend === "green" ? "analysis-positive" : ""}>
                {value}
              </strong>
            </div>
            <svg viewBox="0 0 90 49" aria-hidden="true">
              {trend === "bars" ? (
                Array.from({ length: 11 }, (_, i) => (
                  <rect
                    key={i}
                    x={i * 8}
                    y={46 - [7, 12, 15, 23, 17, 19, 25, 21, 28, 24, 37][i]}
                    width="4"
                    height={[7, 12, 15, 23, 17, 19, 25, 21, 28, 24, 37][i]}
                    rx="2"
                    fill="#ff9dd3"
                  />
                ))
              ) : (
                <>
                  <path
                    d={
                      trend === "down"
                        ? "M3 20 C20 24 25 35 41 27 S66 36 84 24"
                        : trend === "green"
                          ? "M3 40 L28 27 L44 30 L60 18 L84 10"
                          : "M3 31 C18 33 27 18 40 20 S55 29 84 13"
                    }
                    fill="none"
                    stroke={trend === "green" ? "#009f70" : "#e5008d"}
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="3"
                    cy={trend === "down" ? 20 : trend === "green" ? 40 : 31}
                    r="2.5"
                    fill={trend === "green" ? "#009f70" : "#e5008d"}
                  />
                  <circle
                    cx="84"
                    cy={trend === "down" ? 24 : trend === "green" ? 10 : 13}
                    r="2.5"
                    fill={trend === "green" ? "#009f70" : "#e5008d"}
                  />
                </>
              )}
            </svg>
          </article>
        ))}
      </div>
      <div className="analysis-main-grid">
        <article className="analysis-card analysis-evolution">
          <header>
            <div className="analysis-card-title">
              <span>
                <TrendingUp size={19} />
              </span>
              <div>
                <h2>Evolución de la participación</h2>
                <p>
                  {territory}
                  {compare === "national"
                    ? " frente al promedio nacional"
                    : " · periodo seleccionado"}
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
          <div className="analysis-chart-wrap">
            <Chart
              height={278}
              label={`Evolución ilustrativa de ${metric === "participation" ? "participación" : "abstención"} en ${territory}`}
              option={{
                grid: { left: 44, right: 18, top: 25, bottom: 65 },
                tooltip: {
                  ...chartTooltip,
                  trigger: "axis",
                  valueFormatter: (value: number) => percent(value),
                },
                xAxis: {
                  type: "category",
                  boundaryGap: false,
                  data: indices.map((x) => x.year),
                  axisLine: { lineStyle: { color: "#d5dfed" } },
                  axisTick: { lineStyle: { color: "#d5dfed" } },
                  axisLabel: { color: "#254472", fontSize: 12, margin: 12 },
                },
                yAxis: {
                  type: "value",
                  min: metric === "participation" ? 40 : 25,
                  max: metric === "participation" ? 70 : 65,
                  interval: 10,
                  axisLabel: {
                    formatter: "{value}%",
                    color: "#52688a",
                    fontSize: 12,
                  },
                  splitLine: {
                    lineStyle: { color: "#e9eff6", type: "dashed" },
                  },
                },
                legend: {
                  bottom: 5,
                  left: "center",
                  itemWidth: 23,
                  itemHeight: 10,
                  textStyle: { color: "#52688a", fontSize: 12 },
                },
                series: [
                  {
                    name: territory,
                    type: "line",
                    smooth: 0.25,
                    data: chartValues,
                    symbol: "circle",
                    symbolSize: 11,
                    itemStyle: {
                      color: "#e5008d",
                      borderWidth: 1,
                      borderColor: "#fff",
                    },
                    lineStyle: { width: 2.5, color: "#ed008c" },
                    areaStyle: {
                      color: {
                        type: "linear",
                        x: 0,
                        y: 0,
                        x2: 0,
                        y2: 1,
                        colorStops: [
                          { offset: 0, color: "#f7cbe380" },
                          { offset: 1, color: "#fff0" },
                        ],
                      },
                    },
                    label: {
                      show: true,
                      position: "top",
                      formatter: (p: { value: number; dataIndex: number }) =>
                        p.dataIndex === chartValues.length - 1
                          ? ""
                          : percent(p.value),
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#df0085",
                      distance: 8,
                    },
                    z: 3,
                  },
                  ...(compare === "national"
                    ? [
                        {
                          name: "Nacional",
                          type: "line",
                          smooth: 0.25,
                          data: referenceValues,
                          symbol: "circle",
                          symbolSize: 10,
                          itemStyle: {
                            color: "#93a6c0",
                            borderColor: "#fff",
                            borderWidth: 1,
                          },
                          lineStyle: { color: "#93a6c0", width: 2 },
                          label: {
                            show: true,
                            position: "bottom",
                            formatter: (p: { value: number }) =>
                              percent(p.value),
                            color: "#52688a",
                            fontSize: 12,
                            distance: 8,
                          },
                        },
                      ]
                    : []),
                ],
              }}
            />
            <div
              className="analysis-point-callout"
              style={{
                top: Math.max(
                  4,
                  25 +
                    (1 -
                      (chartValues.at(-1)! -
                        (metric === "participation" ? 40 : 25)) /
                        (metric === "participation" ? 30 : 40)) *
                      188 -
                    70,
                ),
              }}
            >
              <span>{territory}</span>
              <strong>{percent(chartValues.at(-1)!)}</strong>
            </div>
          </div>
        </article>
        <article className="analysis-card analysis-reading">
          <header>
            <div className="analysis-card-title">
              <Sparkles
                className="analysis-sparkle"
                size={27}
                fill="currentColor"
              />
              <h2>Lectura de IA</h2>
            </div>
            <span className="analysis-chip">3 hallazgos</span>
          </header>
          <div className="analysis-reading-summary">
            <span className="analysis-kpi-icon">
              <BarChart3 size={22} />
            </span>
            <div>
              <h3>Resumen del periodo seleccionado</h3>
              <p>{summary}</p>
            </div>
          </div>
          <ol className="analysis-findings">
            <li>
              <span>1</span>
              <div>
                <h3>
                  {change >= 0 ? "Recuperación" : "Variación"} de la
                  participación
                </h3>
                <p>
                  {change >= 0 ? "Aumentó" : "Disminuyó"}{" "}
                  {Math.abs(change).toFixed(1)} puntos respecto a {from}.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <h3>Diferencias entre municipios</h3>
                <p>Consulta dónde se concentran los cambios.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <h3>Contexto para interpretar</h3>
                <p>Los patrones observados no demuestran causalidad.</p>
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
                  Resumen ilustrativo calculado con los datos de demostración de
                  esta pantalla.
                </Dialog.Description>
                <p>{summary}</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setAnswer(
                      `En esta muestra, ${rows[0]?.name ?? territory} presenta ${percent(rows[0]?.value ?? participation)} de participación. ${summary} Estos datos son ilustrativos; no permiten concluir causas ni efectos de intervenciones.`,
                    );
                  }}
                >
                  <label>
                    Tu pregunta
                    <input
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="¿Qué territorio tiene mayor participación?"
                      required
                    />
                  </label>
                  <button type="submit" className="analysis-export">
                    Consultar la muestra
                  </button>
                </form>
                {answer && <p role="status">{answer}</p>}
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
              <span>
                <BarChart3 size={19} />
              </span>
              <h2>
                {level === "municipality"
                  ? "Comparativa municipal"
                  : "Comparativa territorial"}
              </h2>
            </div>
            <DashboardSelect
              aria-label="Orden de participación"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="highest">Mayor participación</option>
              <option value="lowest">Menor participación</option>
              <option value="name">Nombre del municipio</option>
            </DashboardSelect>
          </header>
          <div className="analysis-bars">
            {rows.map((row) => (
              <div key={row.name}>
                <span>{row.name}</span>
                <div>
                  <i style={{ width: `${row.value}%` }} />
                </div>
                <strong>{percent(row.value)}</strong>
              </div>
            ))}
            {!rows.length && (
              <p className="analysis-empty">No hay coincidencias.</p>
            )}
          </div>
        </article>
        <article className="analysis-card analysis-details">
          <header>
            <div className="analysis-card-title">
              <span>
                <FileText size={18} />
              </span>
              <h2>
                {level === "municipality"
                  ? "Detalle por municipio"
                  : "Detalle territorial"}
              </h2>
            </div>
            <label className="analysis-search">
              <Search size={15} />
              <input
                aria-label="Buscar municipio del análisis"
                placeholder={
                  level === "municipality"
                    ? "Buscar municipio…"
                    : "Buscar territorio…"
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </header>
          <div className="analysis-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>
                    <button onClick={() => setSort("name")}>
                      {level === "municipality" ? "Municipio" : "Territorio"} ↑
                    </button>
                  </th>
                  <th>Participación</th>
                  <th>Abstención</th>
                  <th>Cambio vs. {from}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{percent(row.value)}</td>
                    <td>{percent(100 - row.value)}</td>
                    <td>
                      <span
                        className={`analysis-change-pill ${row.change < 0 ? "negative" : ""}`}
                      >
                        {points(row.change)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="analysis-empty">
                No hay municipios que coincidan con la búsqueda.
              </p>
            )}
          </div>
          <footer>
            <span>
              {rows.length} de {level === "municipality" ? data.count : 1}{" "}
              {level === "municipality" ? "municipios" : "entidades"}
              <span className="analysis-sample-note">
                {" "}
                · muestra ilustrativa
              </span>
            </span>
            <div>
              <button disabled aria-label="Página anterior">
                <ChevronLeft size={15} />
              </button>
              <span>1</span>
              <button disabled aria-label="Página siguiente">
                <ChevronRight size={15} />
              </button>
            </div>
          </footer>
        </article>
      </div>
      <div className="analysis-disclaimer">
        <Info size={17} /> Datos de demostración · Cifras ilustrativas
      </div>
    </section>
  );
}
