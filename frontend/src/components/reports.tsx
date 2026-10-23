"use client";
import { useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  CalendarDays,
  ChartPie,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  History,
  MapPin,
  Table2,
  Target,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Election, Forecast, Indicator, Prediction } from "@/lib/types";
import { number, pct, riskLabels } from "@/lib/utils";
import { PageKpis } from "./page-kpis";
import { SectionCard } from "./section-card";
import { Note, Status } from "./shared";
import { Button } from "./ui/button";

type Cell = string | number | null | undefined;
interface Report {
  id: string;
  title: string;
  description: string;
  icon: typeof FileText;
  file: string;
  columns: string[];
  rows: Cell[][];
  loading: boolean;
  error: Error | null;
}
const titleCase = (name: string) =>
  name
    .toLocaleLowerCase("es-MX")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-MX"));
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const rate = (v: number | null | undefined) =>
  v == null ? "" : Number((v * 100).toFixed(2));

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

export function Reports({
  states,
  forecast,
  indicators,
  elections,
  selected,
  year,
  search,
  loading,
  error,
  retry,
}: {
  states: Prediction[];
  forecast?: Forecast;
  indicators?: Indicator[];
  elections: Election[];
  selected: string;
  year: number;
  search: string;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}) {
  const [active, setActive] = useState("forecast");
  const history = useQuery({
    queryKey: ["history", selected],
    queryFn: ({ signal }) => api.history(selected, signal),
  });
  const summaries = useQueries({
    queries: elections.map((e) => ({
      queryKey: ["summary", e.year],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.summary(e.year, signal),
    })),
  });
  const chosen = states.find((s) => s.state_code === selected);
  const needle = fold(search.trim());
  const matches = (name: string) => !needle || fold(name).includes(needle);
  const election = elections.find((e) => e.year === year);
  const counts = (["high", "medium", "low"] as const).map((risk) => {
    const group = states.filter((s) => s.risk_level === risk);
    return [
      riskLabels[risk],
      group.length,
      rate(group.length / Math.max(states.length, 1)),
      group.length
        ? rate(group.reduce((s, r) => s + r.predicted, 0) / group.length)
        : "",
    ];
  });
  const reports: Report[] = [
    {
      id: "forecast",
      title: "Estimación 2027 por entidad",
      description: "Abstención estimada, riesgo y banda de referencia.",
      icon: Target,
      file: "pulso-estimacion-2027",
      columns: [
        "Clave",
        "Entidad",
        "Abstención (%)",
        "Riesgo",
        "Límite inferior (%)",
        "Límite superior (%)",
      ],
      rows: states
        .filter((s) => matches(s.name))
        .sort((a, b) => b.predicted - a.predicted)
        .map((s) => [
          s.state_code,
          titleCase(s.name),
          rate(s.predicted),
          riskLabels[s.risk_level],
          rate(s.lower),
          rate(s.upper),
        ]),
      loading,
      error,
    },
    {
      id: "observed",
      title: `Histórico observado ${year}`,
      description: "Conteos oficiales SV, NV y NS con sus tasas.",
      icon: History,
      file: `pulso-observado-${year}`,
      columns: [
        "Clave",
        "Entidad",
        "Lista nominal",
        "SV",
        "NV",
        "NS",
        "Participación (%)",
        "Abstención (%)",
      ],
      rows: (indicators ?? [])
        .filter((r) => matches(r.name))
        .map((r) => [
          r.state_code || r.official_code,
          titleCase(r.name),
          r.nominal_list,
          r.voter_count,
          r.nonvoter_count,
          r.unspecified_count,
          rate(r.participation_rate),
          rate(r.abstention_rate),
        ]),
      loading: indicators == null,
      error: null,
    },
    {
      id: "territory",
      title: `Ficha territorial · ${chosen ? titleCase(chosen.name) : selected}`,
      description: "Serie histórica de la entidad y su estimación 2027.",
      icon: MapPin,
      file: `pulso-ficha-${selected}`,
      columns: ["Año", "Tipo", "Participación (%)", "Abstención (%)", "NS (%)"],
      rows: [
        ...[...(history.data?.items ?? [])]
          .sort((a, b) => a.year - b.year)
          .map((r) => [
            r.year,
            r.election_type === "midterm" ? "Intermedia" : "Presidencial",
            rate(r.participation_rate),
            rate(r.abstention_rate),
            rate(r.unspecified_rate),
          ]),
        ...(chosen
          ? [
              [
                2027,
                "Estimación",
                rate(1 - chosen.predicted),
                rate(chosen.predicted),
                "",
              ],
            ]
          : []),
      ],
      loading: history.isPending,
      error: history.error,
    },
    {
      id: "risk",
      title: "Distribución del riesgo",
      description: "Entidades por nivel del semáforo relativo.",
      icon: ChartPie,
      file: "pulso-distribucion-riesgo-2027",
      columns: ["Nivel", "Entidades", "Porcentaje (%)", "Abstención media (%)"],
      rows: counts,
      loading,
      error,
    },
  ];
  const report = reports.find((r) => r.id === active)!;
  const national = summaries.map((q) => q.data?.items[0]);
  const current = national.find((n) => n?.year === year);
  const downloadCsv = () =>
    save(
      `${report.file}.csv`,
      "text/csv;charset=utf-8",
      "﻿" +
        [report.columns, ...report.rows]
          .map((row) => row.map(csvCell).join(","))
          .join("\r\n"),
    );
  const downloadJson = () =>
    save(
      `${report.file}.json`,
      "application/json",
      JSON.stringify(
        {
          reporte: report.title,
          generado: new Date().toISOString(),
          fuente: "INE · Conteos censales de participación (CCPC)",
          corrida: forecast?.id ?? null,
          filtro: search.trim() || null,
          registros: report.rows.map((row) =>
            Object.fromEntries(report.columns.map((c, i) => [c, row[i]])),
          ),
        },
        null,
        2,
      ),
    );
  return (
    <div className="section-page reports-page">
      <PageKpis
        label="Resumen de reportes"
        items={[
          {
            title: "Reportes disponibles",
            value: String(reports.length),
            reference: "CSV y JSON · UTF-8",
            icon: FileText,
            chart: {
              kind: "bars",
              values: reports.map((r) => Math.max(r.rows.length, 1)),
            },
          },
          {
            title: "Entidades incluidas",
            value: String(
              report.id === "risk" ? states.length : report.rows.length,
            ),
            reference: search.trim()
              ? `Filtro: “${search.trim()}”`
              : "Sin filtro de búsqueda",
            icon: Users,
            chart: {
              kind: "dots",
              filled: report.id === "risk" ? states.length : report.rows.length,
              total: Math.max(states.length, 1),
            },
          },
          {
            title: `Abstención nacional ${year}`,
            value: pct(current?.abstention_rate),
            reference: current
              ? `${number(current.nonvoter_count)} no votantes`
              : "Consultando…",
            icon: CalendarDays,
            chart: {
              kind: "line",
              values: national
                .filter((n) => n?.abstention_rate != null)
                .map((n) => n!.abstention_rate!),
            },
          },
          {
            title: "Periodo cubierto",
            value: elections.length
              ? `${elections[0].year}–${elections.at(-1)!.year}`
              : "—",
            reference: `${elections.length} elecciones · estimación 2027`,
            icon: Table2,
          },
        ]}
      />
      <div
        className="report-catalog"
        role="radiogroup"
        aria-label="Tipo de reporte"
      >
        {reports.map((r) => (
          <button
            type="button"
            role="radio"
            aria-checked={r.id === active}
            key={r.id}
            className="report-option"
            onClick={() => setActive(r.id)}
          >
            <span className="report-option-icon" aria-hidden="true">
              <r.icon />
            </span>
            <strong>{r.title}</strong>
            <span>{r.description}</span>
            <small>
              {r.loading ? "Consultando…" : `${r.rows.length} registros`} · CSV
              · JSON
            </small>
          </button>
        ))}
      </div>
      <SectionCard
        id="report-preview-title"
        icon={FileSpreadsheet}
        title={`Vista previa · ${report.title}`}
        subtitle={
          report.id === "observed" && election
            ? `Proceso ${year} · ${election.election_type === "midterm" ? "Intermedia" : "Presidencial"} · tasas sobre SV + NV`
            : report.description
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadJson}
              disabled={!report.rows.length}
            >
              <FileJson size={15} />
              JSON
            </Button>
            <Button
              size="sm"
              onClick={downloadCsv}
              disabled={!report.rows.length}
            >
              <Download size={15} />
              Descargar CSV
            </Button>
          </>
        }
      >
        <Status
          loading={report.loading}
          error={report.error}
          empty={!report.loading && !report.error && !report.rows.length}
          retry={
            report.id === "territory" ? () => void history.refetch() : retry
          }
        />
        {!report.loading && !report.error && report.rows.length > 0 && (
          <div className="section-table-scroll">
            <table className="section-table">
              <thead>
                <tr>
                  {report.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>
                        {typeof cell === "number" && cell >= 10_000
                          ? number(cell)
                          : (cell ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="section-card-note">
          Datos: INE (CCPC) · estimación experimental sin validación operativa.
          El buscador superior filtra las entidades del reporte.
        </p>
      </SectionCard>
      <Note>
        Los porcentajes se calculan sobre SV + NV; NS se informa aparte. Las
        estimaciones 2027 no son un producto oficial del INE.
      </Note>
    </div>
  );
}
