"use client";

import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  ArrowLeft, BarChart3, Download, Info, MapPinned, ShieldAlert, TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { downloadNationalReport, type NationalReport } from "@/lib/national-export";
import type { Election, Forecast, Prediction, Risk } from "@/lib/types";
import { pct, riskLabels } from "@/lib/utils";
import { Button } from "./ui/button";
import { Status } from "./shared";
import { DashboardSelect } from "./ui/dashboard-select";

const kinds = { midterm: "Intermedia", presidential: "Presidencial" };
const priority: Risk[] = ["high", "medium", "low"];
const title = (name: string) =>
  name.toLocaleLowerCase("es-MX").replace(/(^|\s)\S/g, (s) => s.toLocaleUpperCase("es-MX"));

export function NationalReports({
  states,
  forecast,
  elections,
  onBack,
}: {
  states: Prediction[];
  forecast: Forecast;
  elections: Election[];
  onBack: () => void;
}) {
  const [variable, setVariable] = useState<"abstention" | "participation">("abstention");
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [generating, setGenerating] = useState(false);
  const [exportError, setExportError] = useState("");
  const summaries = useQueries({
    queries: elections.map((election) => ({
      queryKey: ["summary", election.year],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.summary(election.year, signal),
    })),
  });
  const historical = summaries.flatMap((q) => q.data?.items ?? [])
    .sort((a, b) => a.year - b.year);
  const loaded = elections.length > 0 &&
    summaries.every((q) => q.isSuccess && q.data?.items.length === 1) &&
    states.length === 32;
  const sorted = [...states].sort((a, b) => b.predicted - a.predicted);
  const counts = priority.map((level) => ({
    level,
    amount: states.filter((s) => s.risk_level === level).length,
  }));
  const metric = (item: Prediction) =>
    variable === "abstention" ? item.predicted : 1 - item.predicted;

  const download = async () => {
    if (!loaded || generating) return;
    const report: NationalReport = {
      forecast,
      states,
      history: historical,
      variable,
      createdAt: new Date().toISOString(),
    };
    setGenerating(true);
    setExportError("");
    try {
      await downloadNationalReport(report, format);
    } catch {
      setExportError("No se pudo generar el comparativo. Revisa los datos y vuelve a intentarlo.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="section-page national-reports-page">
      <section className="section-card national-report-intro" aria-labelledby="national-report-title">
        <header className="section-card-heading national-report-intro-copy">
          <MapPinned className="section-card-icon" aria-hidden="true" />
          <div>
          <h2 id="national-report-title">Panorama de las 32 entidades</h2>
          <p>
            Consulta los totales históricos oficiales y compara las estimaciones
            estatales de {forecast.target_year}. Las tasas estatales no se promedian
            para construir una predicción nacional.
          </p>
          </div>
        </header>
        <Button type="button" variant="outline" className="national-back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> Volver al reporte estatal
        </Button>
      </section>

      <div className="national-report-config section-card">
        <label className="data-field">
          <span>Variable para comparar entidades</span>
          <DashboardSelect
            aria-label="Variable nacional"
            value={variable}
            onChange={(event) => setVariable(event.target.value as "abstention" | "participation")}
          >
            <option value="abstention">Abstención estatal</option>
            <option value="participation">Participación estatal</option>
          </DashboardSelect>
        </label>
        <fieldset>
          <legend>Formato de descarga</legend>
          <label className="data-radio">
            <input type="radio" name="national-format" checked={format === "pdf"} onChange={() => setFormat("pdf")} />
            PDF
          </label>
          <label className="data-radio">
            <input type="radio" name="national-format" checked={format === "xlsx"} onChange={() => setFormat("xlsx")} />
            Excel
          </label>
        </fieldset>
        <Button className="national-report-download" onClick={() => void download()} disabled={!loaded || generating}>
          <Download size={16} aria-hidden="true" />
          {generating ? "Generando…" : "Descargar comparativo nacional"}
        </Button>
      </div>
      {exportError && <p role="alert" className="national-report-error">{exportError}</p>}
      {!loaded && (
        <Status
          loading={summaries.some((q) => q.isPending)}
          error={summaries.find((q) => q.error)?.error ?? null}
          empty={!summaries.some((q) => q.isPending || q.error)}
          retry={() => summaries.forEach((q) => void q.refetch())}
        />
      )}
      <div className="national-report-grid">
        <section className="section-card" aria-labelledby="national-history-title">
          <div className="national-report-title">
            <TrendingUp size={20} aria-hidden="true" />
            <div>
              <h3 id="national-history-title">Histórico nacional observado</h3>
              <p>Tasas calculadas con conteos agregados SV y NV, no promedios simples.</p>
            </div>
          </div>
          {historical.length ? (
            <div className="national-report-scroll">
              <table className="section-table">
                <thead><tr><th>Año</th><th>Elección</th><th>Participación</th><th>Abstención</th></tr></thead>
                <tbody>
                  {historical.map((row) => {
                    const total = row.voter_count + row.nonvoter_count;
                    return (
                      <tr key={row.year}>
                        <td>{row.year}</td>
                        <td>{kinds[row.election_type]}</td>
                        <td>{total ? pct(row.voter_count / total) : "—"}</td>
                        <td>{total ? pct(row.nonvoter_count / total) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="national-muted">Cargando histórico oficial…</p>}
        </section>

        <section className="section-card" aria-labelledby="national-risk-title">
          <div className="national-report-title">
            <ShieldAlert size={20} aria-hidden="true" />
            <div>
              <h3 id="national-risk-title">Clasificación relativa de riesgo</h3>
              <p>Distribución de las {states.length} estimaciones estatales {forecast.target_year}.</p>
            </div>
          </div>
          <div className="national-risk-list">
            {counts.map(({ level, amount }) => (
              <div className="national-risk-row" key={level}>
                <div><span className={`national-risk-dot ${level}`} aria-hidden="true" />
                  <strong>{riskLabels[level]}</strong><span>{amount} entidades</span></div>
                <div role="img" aria-label={`${riskLabels[level]}: ${amount} de ${states.length} entidades`} className="national-risk-track">
                  <span className={`national-risk-fill ${level}`} style={{ width: `${(amount / states.length) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="section-card" aria-labelledby="national-states-title">
        <div className="national-report-title">
          <BarChart3 size={20} aria-hidden="true" />
          <div>
            <h3 id="national-states-title">Comparación estatal {forecast.target_year}</h3>
            <p>Pronósticos individuales, ordenados de mayor a menor abstención estimada.</p>
          </div>
        </div>
        <div className="national-report-scroll">
          <table className="section-table national-states-table">
            <thead><tr><th>#</th><th>Entidad</th><th>{variable === "abstention" ? "Abstención" : "Participación"}</th><th>Banda de abstención</th><th>Riesgo</th></tr></thead>
            <tbody>
              {sorted.map((state, index) => (
                <tr key={state.state_code}>
                  <td>{index + 1}</td>
                  <td><strong>{title(state.name)}</strong></td>
                  <td>{pct(metric(state))}</td>
                  <td>{pct(state.lower)} – {pct(state.upper)}</td>
                  <td>{riskLabels[state.risk_level]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="national-report-note">
        <Info size={16} aria-hidden="true" />
        <span>
          Fuente: INE CCPC. El histórico nacional es una agregación de conteos
          observados de cada elección. Las estimaciones {forecast.target_year} son
          experimentales, no causales y no equivalen a un pronóstico nacional.
          Corrida: {forecast.id}.
        </span>
      </p>
    </div>
  );
}
