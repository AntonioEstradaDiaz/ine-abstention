import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { projectHorizon } from "../src/lib/assistant-projection.ts";
import {
  buildAssistantContext,
  contextFacts,
  automaticAnswer,
  systemPrompt,
} from "../src/lib/assistant.ts";
const snapshot = JSON.parse(
  await readFile(
    new URL("../src/lib/preview-data.json", import.meta.url),
    "utf8",
  ),
);
const prediction = snapshot.predictions.items.find(
  (p: { state_code: string }) => p.state_code === "17",
);
const history = snapshot.history.filter(
  (r: { state_code: string }) => r.state_code === "17",
);
const registered = { forecast: snapshot.predictions.forecast, prediction };
const context = buildAssistantContext({
  prediction,
  forecast: registered.forecast,
  states: snapshot.predictions.items,
  history,
  thresholds: registered.forecast.calibration.risk.thresholds,
  model: "baseline_last",
  maePP: 3.49,
});

test("2027 uses the registered forecast; other years use same-type observed counts", () => {
  const result = projectHorizon(history, "17", 2027, "midterm", registered);
  assert.equal(result.kind, "registered");
  assert.equal(result.abstention, prediction.predicted);
  const custom = projectHorizon(
    history,
    "17",
    2030,
    "presidential",
    registered,
  );
  const reference = history.find((r: { year: number }) => r.year === 2024);
  assert.equal(custom.kind, "reference");
  assert.equal(custom.referenceYear, 2024);
  assert.equal(
    custom.abstention,
    reference.nonvoter_count /
      (reference.voter_count + reference.nonvoter_count),
  );
  assert.equal(custom.lower, null);
  assert.equal(custom.upper, null);
  assert.equal(custom.forecastId, null);
  assert.equal(
    projectHorizon(history, "17", 2036, "presidential", registered).abstention,
    custom.abstention,
  );
});
test("rejects past years, invalid counts, duplicates and unsupported types", () => {
  for (const year of [2024, 2020, 2030.5, NaN, 2101])
    assert.throws(() =>
      projectHorizon(history, "17", year, "midterm", registered),
    );
  assert.throws(() =>
    projectHorizon(history, "99", 2030, "presidential", registered),
  );
  const row = history.find((r: { year: number }) => r.year === 2024);
  assert.throws(
    () => projectHorizon([row, row], "17", 2030, "presidential"),
    /duplicados/,
  );
  assert.throws(
    () =>
      projectHorizon(
        [{ ...row, voter_count: 0, nonvoter_count: 0 }],
        "17",
        2030,
        "presidential",
      ),
    /conteos/,
  );
  assert.equal(
    projectHorizon(
      [{ ...row, voter_count: 100, nonvoter_count: 0 }],
      "17",
      2030,
      "presidential",
    ).abstention,
    0,
  );
});
test("new observed data invalidates a stale registered forecast", () => {
  const row = {
    ...history[0],
    year: 2025,
    voter_count: 80,
    nonvoter_count: 20,
    election_type: "midterm",
  };
  const result = projectHorizon(
    [...history, row],
    "17",
    2027,
    "midterm",
    registered,
  );
  assert.equal(result.kind, "reference");
  assert.equal(result.abstention, 0.2);
  assert.equal(result.referenceYear, 2025);
});
test("custom horizon facts and offline answer do not reuse 2027 bands or rankings", () => {
  const current = {
    ...context,
    projection: projectHorizon(history, "17", 2030, "presidential", registered),
  };
  const facts = contextFacts(current);
  assert.match(facts, /Año solicitado: 2030/);
  assert.doesNotMatch(facts, /Posición:/);
  assert.match(automaticAnswer("dame la predicción", current), /2030/);
  assert.match(automaticAnswer("predice 2036", current), /Cambia el año/);
  assert.match(systemPrompt(current), /No inventes cifras/);
  assert.match(
    automaticAnswer("Propón soluciones", current),
    /mejoras generales/,
  );
});

test("learns a consistent historical trend and extrapolates the requested year", () => {
  const rows = [2012, 2018, 2024].map((year, i) => ({
    ...history[0], state_code: "17", year, election_type: "presidential",
    voter_count: 80 - 10 * i, nonvoter_count: 20 + 10 * i,
  }));
  const result = projectHorizon(rows, "17", 2025, "presidential");
  assert.ok(Math.abs(result.abstention - (0.4 + 0.1 / 6)) < 1e-10);
  assert.match(result.method, /Regresión lineal/);
  assert.match(result.method, /Validación temporal: 1/);
  assert.equal(result.participation, 1 - result.abstention);
  assert.equal(result.lower, null);
  const changed = rows.map((r, i) => i === 2 ? { ...r, voter_count: 90, nonvoter_count: 10 } : r);
  assert.notEqual(projectHorizon(changed, "17", 2025, "presidential").abstention, result.abstention);
});

test("does not extrapolate a trend that loses against the last observed rate", () => {
  const rows = [2012, 2018, 2024].map((year, i) => ({
    ...history[0], state_code: "17", year, election_type: "presidential",
    voter_count: [80, 60, 60][i], nonvoter_count: [20, 40, 40][i],
  }));
  assert.equal(projectHorizon(rows, "17", 2025, "presidential").abstention, 0.4);
  assert.match(projectHorizon(rows, "17", 2025, "presidential").method, /baseline_last/);
  assert.throws(() => projectHorizon([{...rows[0], voter_count: -1}, ...rows.slice(1)], "17", 2025, "presidential"));
});
