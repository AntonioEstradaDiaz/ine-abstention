"use client";
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
      icon: "9c63f.svg",
    },
    {
      title: "Abstención estimada 2027",
      value: state ? pct(state.predicted) : "—",
      reference: state
        ? `Riesgo ${riskLabels[state.risk_level].toLowerCase()}`
        : "Sin estimación",
      icon: "b08fb.svg",
    },
    {
      title: "Entidades en riesgo alto",
      value: states.length ? `${high} de ${states.length}` : "—",
      reference: "Clasificación estatal relativa",
      icon: "d19fd.svg",
    },
    {
      title: "Banda de abstención 2027",
      value: state ? `${pct(state.lower)} – ${pct(state.upper)}` : "—",
      reference: "Sin cobertura futura garantizada",
      icon: "9c63f.svg",
    },
  ];
  return (
    <div className="reference-kpis" data-name="Indicadores clave">
      {metrics.map((metric) => (
        <article
          className="reference-kpi"
          data-name="Indicador electoral"
          key={metric.title}
          aria-label={metric.title}
        >
          <div className="reference-kpi-icon reference-kpi-icon-line">
            <img src={`/design-top/${metric.icon}`} alt="" />
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
        </article>
      ))}
    </div>
  );
}
