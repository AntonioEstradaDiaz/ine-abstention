"use client";
import { DashboardSelect } from "./ui/dashboard-select";
import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import type { ElectionType, Prediction, Source } from "@/lib/types";
import { pct, pp, number } from "@/lib/utils";
import { Chart, chartAxis, chartTooltip } from "./chart";
import { Note, SourceLink, Status } from "./shared";

const colors = ["#C4006B", "#58BFA2", "#E9BD54"];
export function Trends({
  selected,
  states,
  sources,
}: {
  selected: string;
  states: Prediction[];
  sources?: Source[];
}) {
  const [type, setType] = useState<ElectionType>("midterm");
  const [metric, setMetric] = useState<
    "abstention_rate" | "participation_rate"
  >("abstention_rate");
  const [additional, setAdditional] = useState<string[]>([]);
  const codes = [selected, ...additional.filter((c) => c !== selected)].slice(
    0,
    3,
  );
  const queries = useQueries({
    queries: codes.map((code) => ({
      queryKey: ["history", code],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.history(code, signal),
    })),
  });
  const loading = queries.some((q) => q.isPending);
  const error = queries.find((q) => q.error)?.error;
  const histories = queries.map(
    (q) =>
      q.data?.items
        .filter((i) => i.election_type === type)
        .sort((a, b) => a.year - b.year) ?? [],
  );
  const first = histories[0] ?? [];
  const years = [
    ...new Set(histories.flatMap((h) => h.map((r) => r.year))),
  ].sort();
  const change =
    first.length >= 2 &&
    first[0][metric] != null &&
    first.at(-1)![metric] != null
      ? (first.at(-1)![metric]! - first[0][metric]!) * 100
      : null;
  const option = useMemo(
    () => ({
      color: colors,
      tooltip: {
        ...chartTooltip,
        valueFormatter: (v: number) => `${v.toFixed(1)}%`,
      },
      legend: {
        bottom: 0,
        type: "scroll",
        itemGap: 28,
        textStyle: { color: "#596D8D", fontSize: 11 },
        icon: "circle",
        itemWidth: 8,
        itemHeight: 8,
      },
      grid: { left: 42, right: 30, top: 25, bottom: 60 },
      xAxis: {
        ...chartAxis,
        type: "category",
        boundaryGap: false,
        data: years.map(String),
        splitLine: { show: false },
      },
      yAxis: {
        ...chartAxis,
        type: "value",
        min: 0,
        max: 100,
        interval: 25,
        axisLabel: { color: "#596D8D", formatter: "{value}%", fontSize: 11 },
      },
      series: histories.map((h, idx) => ({
        name:
          states.find((s) => s.state_code === codes[idx])?.name ?? codes[idx],
        type: "line",
        smooth: false,
        symbolSize: 8,
        lineStyle: { width: 2.5 },
        data: years.map((y) => {
          const rate = h.find((r) => r.year === y)?.[metric];
          return rate == null ? null : rate * 100;
        }),
      })),
    }),
    [
      JSON.stringify(histories),
      metric,
      years.join(","),
      codes.join(","),
      states,
    ],
  ); // Stable chart options across unrelated renders.
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Una historia electoral comparable</h2>
            <p>
              {type === "midterm"
                ? "Elecciones intermedias"
                : "Elecciones presidenciales"}{" "}
              · Hasta tres estados
            </p>
          </div>
          <label className="inline-label">
            Tipo de elección
            <DashboardSelect
              aria-label="Tipo de elección"
              value={type}
              onChange={(e) => setType(e.target.value as ElectionType)}
            >
              <option value="midterm">Intermedia</option>
              <option value="presidential">Presidencial</option>
            </DashboardSelect>
          </label>
        </div>
        <div className="trend-controls">
          <div className="segmented">
            <button
              aria-pressed={metric === "abstention_rate"}
              onClick={() => setMetric("abstention_rate")}
            >
              Abstención
            </button>
            <button
              aria-pressed={metric === "participation_rate"}
              onClick={() => setMetric("participation_rate")}
            >
              Participación
            </button>
          </div>
          <label className="inline-label">
            Comparar con
            <DashboardSelect
              aria-label="Añadir estado a la comparación"
              value=""
              disabled={codes.length >= 3}
              onChange={(e) => {
                if (e.target.value)
                  setAdditional(
                    [
                      ...additional.filter((c) => c !== selected),
                      e.target.value,
                    ].slice(0, 2),
                  );
              }}
            >
              <option value="">
                {codes.length >= 3 ? "Máximo tres estados" : "Añadir estado…"}
              </option>
              {states
                .filter((s) => !codes.includes(s.state_code))
                .map((s) => (
                  <option key={s.state_code} value={s.state_code}>
                    {s.name}
                  </option>
                ))}
            </DashboardSelect>
          </label>
        </div>
        <div className="comparison-chips">
          {codes.map((code, i) => (
            <span key={code} style={{ borderColor: colors[i] }}>
              <i style={{ background: colors[i] }} />
              {states.find((s) => s.state_code === code)?.name ?? code}
              {i > 0 && (
                <button
                  aria-label={`Quitar ${states.find((s) => s.state_code === code)?.name}`}
                  onClick={() =>
                    setAdditional(additional.filter((c) => c !== code))
                  }
                >
                  <X size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
        <Status
          loading={loading}
          error={error}
          empty={!loading && !error && !first.length}
          retry={() => {
            queries.forEach((q) => void q.refetch());
          }}
        />
        {!loading && !error && first.length > 0 && (
          <>
            <Chart
              option={option}
              label={`${metric === "abstention_rate" ? "Abstención" : "Participación"} histórica por estado, elecciones ${type === "midterm" ? "intermedias" : "presidenciales"}. Valores exactos en la tabla siguiente.`}
              height={340}
            />
            <div className="trend-summary">
              <span>
                Estado seleccionado · {first[0].year}–{first.at(-1)!.year}
              </span>
              <strong>{pp(change)}</strong>
              <span>
                cambio observado en{" "}
                {metric === "abstention_rate" ? "abstención" : "participación"}
              </span>
            </div>
          </>
        )}
        <div className="panel-note">
          <Note>
            Las elecciones presidenciales e intermedias se analizan por
            separado. Estas diferencias son descriptivas, sin interpretación
            causal.
          </Note>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Observaciones históricas</h2>
            <p>Tasas calculadas sobre SV + NV · NS se conserva por separado</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Estado / elección</th>
                <th>Participación</th>
                <th>Abstención</th>
                <th>SV + NV</th>
                <th>Sin especificar</th>
                <th>Procedencia</th>
              </tr>
            </thead>
            <tbody>
              {!error &&
                histories.flatMap((h) =>
                  h.map((r) => (
                    <tr key={`${r.territory_id}-${r.year}`}>
                      <td>
                        <strong>{r.name}</strong>
                        <span className="cell-subtitle">
                          {r.year} ·{" "}
                          {type === "midterm" ? "Intermedia" : "Presidencial"}
                        </span>
                      </td>
                      <td>{pct(r.participation_rate)}</td>
                      <td className="value-cell">{pct(r.abstention_rate)}</td>
                      <td>{number(r.voter_count + r.nonvoter_count)}</td>
                      <td>{pct(r.unspecified_rate)}</td>
                      <td>
                        <SourceLink id={r.source_id} sources={sources} />
                      </td>
                    </tr>
                  )),
                )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
