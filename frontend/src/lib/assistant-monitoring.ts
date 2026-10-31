import type { AssistantContext } from "./assistant";
import { projectHorizon } from "./assistant-projection.ts";

export function monitoringFacts(c: AssistantContext) {
  const type = c.projection?.electionType ?? c.forecast.election_type;
  const rows = c.observedHistory.filter(r => (r.state_code || r.official_code) === c.stateCode && r.election_type === type).sort((a,b) => a.year-b.year);
  const latest = rows.at(-1), previous = rows.at(-2);
  const rate = (r: typeof latest) => r && r.voter_count + r.nonvoter_count > 0 ? r.voter_count / (r.voter_count + r.nonvoter_count) : null;
  const a = rate(previous), b = rate(latest);
  const history = latest && previous && a !== null && b !== null
    ? `${previous.year} → ${latest.year}: participación ${(a*100).toFixed(1)}% → ${(b*100).toFixed(1)}%; cambio ${((b-a)*100).toFixed(2)} pp. Votantes: ${previous.voter_count} → ${latest.voter_count}; diferencia ${latest.voter_count-previous.voter_count}. Fuentes INE: ${previous.source_id}, ${latest.source_id}. El cambio en conteos puede diferir del cambio en tasa; no demuestra causas.`
    : "Histórico comparable insuficiente para calcular un cambio entre dos elecciones.";
  const cutoff = Math.max(...c.observedHistory.filter(r => (r.state_code || r.official_code) === c.stateCode).map(r => r.year));
  const projections: string[] = [];
  for(let year=cutoff+1; year<=2029 && year>=2025; year++) {
    try {
      const p=projectHorizon(c.observedHistory,c.stateCode,year,type,{forecast:c.forecast,prediction:c.prediction});
      projections.push(`${year}: participación ${(p.participation*100).toFixed(1)}%, abstención ${(p.abstention*100).toFixed(1)}%; rango de abstención ${p.lower === null || p.upper === null ? "no disponible" : `${(p.lower*100).toFixed(1)}%–${(p.upper*100).toFixed(1)}%`}. ${p.method}`);
    } catch { projections.push(`${year}: proyección no disponible con los datos actuales.`); }
  }
  const signals = [
    a !== null && b !== null ? b<a ? "La última tasa comparable disminuyó: revisar si el patrón persiste en nuevas observaciones." : "La última comparación no muestra una disminución de la tasa de participación." : "No puede determinarse la dirección del cambio.",
    `${rows.length} elecciones comparables disponibles; un histórico corto limita la evaluación temporal.`,
    latest?.unspecified_rate != null ? `Registros NS en ${latest.year}: ${(latest.unspecified_rate*100).toFixed(1)}%. Revisar cobertura y sensibilidad; no equivalen a abstención.` : "No hay porcentaje NS disponible: revisar calidad de los registros.",
    "No se han validado umbrales automáticos de alerta. Las señales son descriptivas y no prueban causas."
  ].join(" ");
  const plan = "Plan de seguimiento: 1) Equipo de datos: al recibir una publicación oficial, comprobar fuente, versión, duplicados, conteos SV/NV/NS y cambios territoriales; registrar incidencias antes de incorporar datos. 2) Equipo de análisis: comparar tasa y conteo con la última elección del mismo tipo y documentar diferencias. 3) Equipo de modelado: recalcular escenarios hasta 2029 y evaluar errores con cortes temporales sin usar datos futuros. 4) Antes de activar alertas: definir criterios con históricos y medir falsas alarmas y cambios no detectados. Revisar tras cada publicación comparable, no inferir nuevas observaciones entre elecciones. Este es un plan propuesto, no un monitor automático activo.";
  return {history, comparison: `${c.state}; referencia ${type === "midterm" ? "intermedia" : "presidencial"}; corte ${cutoff}.\n${projections.join("\n")}\nSon escenarios experimentales condicionados al mismo tipo electoral; no confirman que haya elección cada año. Resultados iguales pueden reflejar el método de referencia constante; no se inventan tendencias.`, signals, plan};
}

export function monitoringAnswer(c: AssistantContext, question: string): string | null {
  const q=question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const f=monitoringFacts(c);
  if (/compar.*(ano|202[5-9]|proyeccion)|202[5-9].*202[5-9]/.test(q)) return f.comparison;
  if (/senal|alerta|datos faltan/.test(q)) return f.signals;
  if (/seguimiento|anticipar|que observar/.test(q)) return `${f.signals}\n\n${f.plan}`;
  if (/cambio.*histor|participacion.*baj|votos.*baj|histor.*cambio/.test(q)) return f.history;
  return null;
}
