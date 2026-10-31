import type { ElectionType, Indicator } from "./types";

/** Retrospective last-observation benchmark, never a certification of another model. */
export function evaluateHistoricalReference(history: Indicator[], stateCode: string, type: ElectionType, cutoff: number) {
  const rows = history.filter(r => r.territory_type === "state" && (r.state_code || r.official_code) === stateCode && r.year <= cutoff && r.election_type === type).sort((a,b) => a.year-b.year);
  if (!rows.length) return { error: "No hay elecciones comparables disponibles para esta entidad." } as const;
  if (new Set(rows.map(r=>r.year)).size !== rows.length || rows.some(r => !Number.isInteger(r.year) || ![r.voter_count,r.nonvoter_count].every(n=>Number.isFinite(n) && n>=0) || r.voter_count+r.nonvoter_count<=0)) return { error: "Revisa los años duplicados o conteos inválidos antes de evaluar." } as const;
  const rate = (r: Indicator) => r.nonvoter_count/(r.voter_count+r.nonvoter_count)*100;
  const folds = rows.slice(1).map((r,i)=>({year:r.year, referenceYear:rows[i].year, estimated:rate(rows[i]), observed:rate(r), error:Math.abs(rate(r)-rate(rows[i])), sourceId:r.source_id}));
  const latest = rows.at(-1)!;
  const ns = latest.unspecified_count;
  const total = latest.voter_count+latest.nonvoter_count+ns;
  const sensitivity = Number.isFinite(ns) && ns>=0 && Number.isFinite(total) && total>0 ? { unspecified:ns/total*100, lower:latest.nonvoter_count/total*100, upper:(latest.nonvoter_count+ns)/total*100 } : null;
  return { rows, folds, latest, sensitivity, mae:folds.length ? folds.reduce((sum,f)=>sum+f.error,0)/folds.length : null };
}
