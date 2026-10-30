"use client";
import { UsersRound, TriangleAlert, Building2, BetweenHorizontalStart } from "lucide-react";
import type { Prediction } from "@/lib/types";
import { pct, riskLabels } from "@/lib/utils";

export function ElectoralKpis({
  states = [],
  selected,
}: {
  states?: Prediction[];
  selected?: string;
}) {
  const state = states.find((item) => item.state_code === selected);
  const high = states.filter((item) => item.risk_level === "high").length;
  const metrics = [
    {
      title: "Participación estimada 2027",
      value: state ? pct(1 - state.predicted) : "—",
      reference: state?.name ?? "Consultando territorio",
      icon: UsersRound,
    },
    {
      title: "Abstención estimada 2027",
      value: state ? pct(state.predicted) : "—",
      reference: state
        ? `Riesgo ${riskLabels[state.risk_level].toLowerCase()}`
        : "Sin estimación",
      icon: TriangleAlert,
    },
    {
      title: "Entidades en riesgo alto",
      value: states.length ? `${high} de ${states.length}` : "—",
      reference: "Clasificación estatal relativa",
      icon: Building2,
    },
    {
      title: "Banda de abstención 2027",
      value: state ? `${pct(state.lower)} – ${pct(state.upper)}` : "—",
      reference: "Sin cobertura futura garantizada",
      icon: BetweenHorizontalStart,
    },
  ];
  return (
    <div className="reference-kpis" data-name="Indicadores clave">
      {metrics.map((metric, index) => (
        <article
          className="reference-kpi"
          data-name="Indicador electoral"
          key={metric.title}
          aria-label={metric.title}
        >
          <div className="reference-kpi-icon reference-kpi-icon-line" aria-hidden="true">
            <metric.icon className="reference-kpi-symbol" strokeWidth={2} />
          </div>
          <div className="reference-kpi-body">
            <p className="reference-kpi-title">{metric.title}</p>
            <div className="reference-kpi-details">
              <div className="reference-kpi-value">
                <strong>{metric.value}</strong>
                <span>{metric.reference}</span>
              </div>
            </div>
          </div>
          <div className="kpi-mini-chart" aria-hidden="true">
            {index === 2 ? <div className="kpi-dot-grid">{states.map((item) => <i key={item.state_code} data-active={item.risk_level === "high"} />)}</div> : <svg viewBox="0 0 100 50">
              <rect x="0" y="20" width="100" height="12" rx="6" fill="#fce7f2" />
              {state && <rect x={index === 3 ? state.lower * 100 : 0} y="20" width={(index === 3 ? state.upper - state.lower : index === 0 ? 1-state.predicted : state.predicted) * 100} height="12" rx="6" fill="#d00070" />}
            </svg>}
          </div>
        </article>
      ))}
    </div>
  );
}
