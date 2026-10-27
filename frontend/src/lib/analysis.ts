import type { Election, Indicator } from "./types";

type Counts = Pick<Indicator, "voter_count" | "nonvoter_count">;
export function analysisRates(row?: Counts) {
  if (
    !row ||
    !Number.isFinite(row.voter_count) ||
    !Number.isFinite(row.nonvoter_count) ||
    row.voter_count < 0 ||
    row.nonvoter_count < 0
  )
    return null;
  const known = row.voter_count + row.nonvoter_count;
  return known > 0
    ? {
        participation: row.voter_count / known,
        abstention: row.nonvoter_count / known,
      }
    : null;
}
export function participationChange(current?: Counts, previous?: Counts) {
  const a = analysisRates(current),
    b = analysisRates(previous);
  return a && b ? (a.participation - b.participation) * 100 : null;
}
export function comparableElections(elections: Election[], year: number) {
  const reference = elections.find((election) => election.year === year);
  return reference
    ? elections
        .filter(
          (election) =>
            election.election_type === reference.election_type &&
            election.year <= year,
        )
        .sort((a, b) => a.year - b.year)
    : [];
}
