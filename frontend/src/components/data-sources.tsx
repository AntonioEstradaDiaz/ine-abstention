"use client";
import { useQueries } from "@tanstack/react-query";
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  Database,
  FileCheck2,
  Grid3x3,
  Landmark,
  Map as MapIcon,
  ShieldCheck,
  Vote,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Election, Forecast, Prediction, Source } from "@/lib/types";
import { number, pct } from "@/lib/utils";
import { Chart } from "./chart";
import { PageKpis } from "./page-kpis";
import { SectionCard } from "./section-card";
import { Note, Status } from "./shared";

const titleCase = (name: string) =>
  name
    .toLocaleLowerCase("es-MX")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-MX"));
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const glossary = [
  ["Lista nominal", "Personas registradas con credencial vigente para votar."],
  ["SV", "Personas de la lista nominal que votaron (sí votó)."],
  ["NV", "Personas de la lista nominal que no votaron (no votó)."],
  ["NS", "Registros sin especificar; se excluyen del denominador."],
  ["Participación", "SV / (SV + NV): tasa sobre participación conocida."],
  ["Abstención", "NV / (SV + NV): complemento de la participación."],
  [
    "Banda",
    "Rango empírico basado en errores temporales; sin cobertura garantizada.",
  ],
  [
    "Riesgo",
    "Semáforo relativo por terciles históricos; no es estándar del INE.",
  ],
];

export function DataSources({
  elections,
  sources,
  states,
  forecast,
  search,
  selected,
  preview,
}: {
  elections: Election[];
  sources?: Source[];
  states: Prediction[];
  forecast?: Forecast;
  search: string;
  selected: string;
  preview: boolean;
}) {
  const coverage = useQueries({
    queries: elections.map((e) => ({
      queryKey: ["indicators", e.year],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.indicators(e.year, signal),
    })),
  });
  const loading = coverage.some((q) => q.isPending);
  const error = coverage.find((q) => q.error)?.error ?? null;
  const rows = coverage.flatMap((q) => q.data?.items ?? []);
  const needle = fold(search.trim());
  const names = [
    ...new Map(
      rows.map((r) => [r.state_code || r.official_code, titleCase(r.name)]),
    ),
  ]
    .filter(([, name]) => !needle || fold(name).includes(needle))
    .sort((a, b) => b[0].localeCompare(a[0]));
  const years = elections.map((e) => e.year);
  const cells = rows.flatMap((r) => {
    const y = names.findIndex(
      ([code]) => code === (r.state_code || r.official_code),
    );
    return y < 0 || r.abstention_rate == null
      ? []
      : [
          [
            years.indexOf(r.year),
            y,
            Number((r.abstention_rate * 100).toFixed(1)),
          ],
        ];
  });
  const nsRates = rows
    .map((r) => r.unspecified_rate)
    .filter((v): v is number => v != null);
  const nominal = rows
    .filter((r) => r.year === years.at(-1))
    .reduce((sum, r) => sum + r.nominal_list, 0);
  const option = {
    tooltip: {
      backgroundColor: "#FFFFFF",
      borderColor: "#DCE2EB",
      textStyle: { color: "#0D172F", fontSize: 12 },
      confine: true,
      formatter: (item: { value: number[] }) =>
        `${names[item.value[1]]?.[1]} · ${years[item.value[0]]}<br/>Abstención ${item.value[2].toFixed(1)}%`,
    },
    grid: { left: 130, right: 12, top: 8, bottom: 64 },
    xAxis: {
      type: "category",
      data: elections.map(
        (e) =>
          `${e.year}\n${e.election_type === "midterm" ? "Intermedia" : "Presidencial"}`,
      ),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#596D8D", fontSize: 10, lineHeight: 14 },
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: names.map(([, name]) => name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: "#162b49",
        fontSize: 10,
        width: 120,
        overflow: "truncate",
      },
    },
    visualMap: {
      min: 25,
      max: 70,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemWidth: 10,
      itemHeight: 140,
      text: ["70%", "25%"],
      textStyle: { color: "#596D8D", fontSize: 10 },
      inRange: { color: ["#fff0f8", "#f7a6d1", "#ef55aa", "#c00063"] },
      calculable: false,
    },
    series: [
      {
        type: "heatmap",
        data: cells,
        itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 4 },
        emphasis: { itemStyle: { borderColor: "#0d172f", borderWidth: 1 } },
      },
    ],
  };
  const highlighted = names.find(([code]) => code === selected)?.[1];
  return (
    <div className="section-page data-page">
      <PageKpis
        label="Resumen de datos"
        items={[
          {
            title: "Elecciones federales",
            value: String(elections.length),
            reference: years.length ? `${years[0]}–${years.at(-1)}` : "—",
            icon: Vote,
            chart: {
              kind: "bars",
              values: elections.map((e) =>
                e.election_type === "midterm" ? 1 : 2,
              ),
            },
          },
          {
            title: "Registros estatales",
            value: number(rows.length),
            reference: `${new Set(rows.map((r) => r.state_code || r.official_code)).size} entidades`,
            icon: Grid3x3,
            chart: {
              kind: "dots",
              filled: rows.length,
              total: 32 * Math.max(years.length, 1),
            },
          },
          {
            title: `Lista nominal ${years.at(-1) ?? ""}`,
            value: nominal ? `${(nominal / 1_000_000).toFixed(1)} M` : "—",
            reference: "Suma de entidades",
            icon: Building2,
            chart: {
              kind: "line",
              values: years.map((y) =>
                rows
                  .filter((r) => r.year === y)
                  .reduce((s, r) => s + r.nominal_list, 0),
              ),
            },
          },
          {
            title: "Sin especificar (NS) medio",
            value: nsRates.length
              ? pct(nsRates.reduce((s, v) => s + v, 0) / nsRates.length)
              : "—",
            reference: "Sobre la lista nominal",
            icon: FileCheck2,
            chart: {
              kind: "line",
              values: years.map((y) => {
                const v = rows
                  .filter((r) => r.year === y && r.unspecified_rate != null)
                  .map((r) => r.unspecified_rate!);
                return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
              }),
            },
          },
        ]}
      />
      <div className="data-main">
        <SectionCard
          id="coverage-title"
          icon={Grid3x3}
          title="Cobertura histórica de abstención"
          subtitle={`Entidades × elecciones · ${highlighted ? `seleccionada: ${highlighted}` : "INE CCPC"}`}
          className="coverage-card"
        >
          <Status
            loading={loading}
            error={error}
            empty={!loading && !error && !cells.length}
            retry={() => coverage.forEach((q) => void q.refetch())}
          />
          {!loading && !error && cells.length > 0 && (
            <Chart
              option={option}
              label={`Mapa de calor de abstención observada por entidad y elección, ${names.length} entidades.`}
              height={Math.max(220, names.length * 22 + 80)}
            />
          )}
          <p className="section-card-note">
            Tasas observadas sobre SV + NV. Intermedias y presidenciales no se
            mezclan en las comparaciones del modelo.
          </p>
        </SectionCard>
        <SectionCard
          id="sources-title"
          icon={Landmark}
          title="Fuentes oficiales"
          subtitle="Conteos censales de participación · INE"
          className="sources-card"
        >
          {sources?.length ? (
            <ul className="data-source-list">
              {sources.map((s) => (
                <li key={s.id}>
                  <span className="data-source-year">{s.year}</span>
                  <div>
                    <strong>{s.dataset_name}</strong>
                    <small>{s.institution}</small>
                  </div>
                  <a
                    href={s.landing_url || s.source_url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Abrir ${s.dataset_name}`}
                  >
                    <ArrowUpRight size={15} />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <Status loading={!sources} empty={!!sources} />
          )}
          <p className="section-card-note">
            Descarga, inventario y SHA-256 verificados en la ingesta.
          </p>
        </SectionCard>
      </div>
      <div className="section-grid-2">
        <SectionCard
          id="glossary-title"
          icon={BookOpen}
          title="Diccionario de variables"
          subtitle="Cómo se leen los indicadores del tablero"
        >
          <dl className="glossary">
            {glossary.map(([term, text]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
        <SectionCard
          id="provenance-title"
          icon={ShieldCheck}
          title="Procedencia y calidad"
          subtitle="Trazabilidad de los datos que alimentan el tablero"
        >
          <ul className="section-bars provenance-list">
            <li>
              <Database aria-hidden="true" />
              <span>Origen de los datos</span>
              <strong>
                {preview
                  ? "Instantánea del repositorio"
                  : "API FastAPI · PostgreSQL"}
              </strong>
            </li>
            <li>
              <Vote aria-hidden="true" />
              <span>Corrida del pronóstico</span>
              <strong>{forecast?.id ?? "—"}</strong>
            </li>
            <li>
              <FileCheck2 aria-hidden="true" />
              <span>Modelo de producción</span>
              <strong>
                {forecast
                  ? `${forecast.provenance.model_name} · ${forecast.provenance.production_ready ? "validado" : "experimental"}`
                  : "—"}
              </strong>
            </li>
            <li>
              <MapIcon aria-hidden="true" />
              <span>Cartografía</span>
              <strong>
                <a
                  className="text-link"
                  href="/geo/provenance.json"
                  target="_blank"
                  rel="noreferrer"
                >
                  INEGI · manifiesto
                  <ArrowUpRight size={12} />
                </a>
              </strong>
            </li>
            <li>
              <Grid3x3 aria-hidden="true" />
              <span>Entidades con estimación</span>
              <strong>{states.length} de 32</strong>
            </li>
          </ul>
          <Note>
            Municipios y secciones requieren homologación histórica antes de
            habilitarse. Prototipo sin aval del INE.
          </Note>
        </SectionCard>
      </div>
    </div>
  );
}
