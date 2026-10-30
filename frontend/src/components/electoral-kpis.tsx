"use client";
import { UsersRound, TriangleAlert, Building2, MoveHorizontal } from "lucide-react";
import type { Prediction } from "@/lib/types";
import { pct, riskLabels } from "@/lib/utils";
import styles from "./electoral-kpis.module.css";

export function ElectoralKpis({ states = [], selected }: { states?: Prediction[]; selected?: string }) {
  const state = states.find((item) => item.state_code === selected);
  const high = states.filter((item) => item.risk_level === "high").length;
  const metrics = [
    { title: "Participación estimada 2027", icon: UsersRound, reference: state?.name ?? "Consultando territorio" },
    { title: "Abstención estimada 2027", icon: TriangleAlert, reference: "Complemento de la participación" },
    { title: "Entidades en riesgo alto", icon: Building2, reference: "Clasificación estatal relativa" },
    { title: "Banda de abstención 2027", icon: MoveHorizontal, reference: "Sin cobertura futura garantizada" },
  ];
  return (
    <div className={styles.grid} data-name="Indicadores clave">
      {metrics.map((metric, index) => (
        <article className={`${styles.card} ${index === 1 ? styles.featured : ""}`} key={metric.title} aria-label={metric.title}>
          <header className={styles.header}>
            <p>{metric.title}</p>
            <span className={styles.icon} aria-hidden="true"><metric.icon size={24} strokeWidth={2} /></span>
          </header>
          <div className={`${styles.value} ${index === 3 ? styles.rangeValue : ""}`}>
            {index === 2 ? <><strong>{states.length ? high : "—"}</strong>{states.length > 0 && <span>de {states.length}</span>}</>
              : index === 3 ? <strong>{state ? <>{pct(state.lower)} <em>–</em> {pct(state.upper)}</> : "—"}</strong>
              : <strong>{state ? pct(index === 0 ? 1 - state.predicted : state.predicted) : "—"}</strong>}
            {index === 1 && <span className={styles.badge}><i />{state ? `Riesgo ${riskLabels[state.risk_level].toLowerCase()}` : "Sin estimación"}</span>}
          </div>
          <div className={styles.visual} aria-hidden="true">
            {index === 2 ? <div className={styles.dots}>{Array.from({ length: states.length }, (_, i) => <i key={i} data-active={i < high} />)}</div>
              : <div className={styles.track}>
                {state && <span className={index === 3 ? styles.interval : styles.fill} style={{ left: `${index === 3 ? state.lower * 100 : 0}%`, width: `${(index === 3 ? state.upper - state.lower : index === 0 ? 1 - state.predicted : state.predicted) * 100}%` }} />}
                {index === 3 && state && <i className={styles.marker} style={{ left: `${state.predicted * 100}%` }} />}
              </div>}
          </div>
          <p className={styles.reference}>{metric.reference}</p>
        </article>
      ))}
    </div>
  );
}
