import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compareStateScenarios, comparisonCsv } from "../src/lib/scenario-comparison.ts";

const snapshot = JSON.parse(await readFile(new URL("../src/lib/preview-data.json", import.meta.url), "utf8"));
const { items, forecast } = snapshot.predictions;

test("comparación de estados es aritmética y no muta el pronóstico", () => {
  const before = items[0].predicted;
  const rows = compareStateScenarios(items, [items[0].state_code, items[1].state_code], 3, forecast);
  assert.equal(rows.length, 2);
  assert.ok(Math.abs(rows[0].scenario - Math.max(0, before - .03)) < 1e-9);
  assert.equal(items[0].predicted, before);
  assert.equal(rows[0].riskBefore, items[0].risk_level);
});
test("supuestos y selección se validan antes de comparar", () => {
  assert.throws(() => compareStateScenarios(items, [items[0].state_code], 3, forecast), /dos a seis/);
  assert.throws(() => compareStateScenarios(items, [items[0].state_code, items[0].state_code], 3, forecast), /distintos/);
  assert.throws(() => compareStateScenarios(items, [items[0].state_code, "99"], 3, forecast), /sin pronóstico/);
  assert.throws(() => compareStateScenarios(items, [items[0].state_code, items[1].state_code], Infinity, forecast), /Supuesto/);
});
test("CSV incorpora fuente y ambos estados", () => {
  const rows = compareStateScenarios(items, [items[0].state_code, items[1].state_code], -2, forecast);
  const csv = comparisonCsv(rows, forecast);
  assert.match(csv, /Corrida/);
  assert.ok(csv.includes(forecast.id));
  assert.equal(csv.split("\r\n").length, 3);
});
