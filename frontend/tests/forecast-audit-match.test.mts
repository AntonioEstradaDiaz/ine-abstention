import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { matchesForecastAudit } from "../src/lib/forecast-audit-match.ts";
import type { Forecast } from "../src/lib/types.ts";
const audit = JSON.parse(await readFile(new URL("../src/lib/forecast-validation.json", import.meta.url), "utf8"));
const original: Forecast = JSON.parse(await readFile(new URL("../../docs/phase5_results.json", import.meta.url), "utf8"));

test("accepts the exact audited forecast and rounded calibration evidence", () => {
  assert.equal(matchesForecastAudit(original, audit), true);
});
test("a new forecast cannot reuse evidence just because its model is unchanged", () => {
  assert.equal(matchesForecastAudit({ ...original, id: "new-forecast" }, audit), false);
  assert.equal(matchesForecastAudit({ ...original, provenance: { ...original.provenance, model_run_id: "new-training" } }, audit), false);
});
test("changed uncertainty or election cannot inherit the frozen audit", () => {
  for (const change of [{ radius: 0.5 }, { radius: NaN }, { calibration_years: [2024] }, { election_blocks: 2 }, { coverage_guaranteed: true }]) {
    const forecast = structuredClone(original);
    Object.assign(forecast.calibration.uncertainty, change);
    assert.equal(matchesForecastAudit(forecast, audit), false);
  }
  assert.equal(matchesForecastAudit({ ...original, target_year: 2030 }, audit), false);
});
test("preview data is not evidence for an audited production forecast", async () => {
  const preview = JSON.parse(await readFile(new URL("../src/lib/preview-data.json", import.meta.url), "utf8"));
  assert.equal(matchesForecastAudit(preview.predictions.forecast, audit), false);
});
