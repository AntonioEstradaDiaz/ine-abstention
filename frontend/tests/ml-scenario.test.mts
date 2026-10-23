import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mlScenario } from "../src/lib/ml-scenario.ts";
import type { MLLaboratory } from "../src/lib/ml-types.ts";

const report: MLLaboratory = JSON.parse(
  readFileSync(
    new URL("../../data/samples/ml_laboratory.json", import.meta.url),
    "utf8",
  ),
);

test("escenarios de los seis modelos: límites, identidad y signo del cambio", () => {
  for (const model of report.models)
    for (const forecast of model.forecasts) {
      const zero = mlScenario(forecast, model, 0);
      assert.equal(zero.predicted, forecast.predicted);
      assert.equal(zero.lower, forecast.lower);
      assert.equal(zero.upper, forecast.upper);
      assert.equal(zero.risk_level, forecast.risk_level);
      for (const delta of [-100, -20, 3, 20, 100]) {
        const scenario = mlScenario(forecast, model, delta);
        assert.ok(
          0 <= scenario.lower &&
            scenario.lower <= scenario.predicted &&
            scenario.predicted <= scenario.upper &&
            scenario.upper <= 1,
        );
        assert.ok(
          Math.abs(scenario.predicted + scenario.participation - 1) < 1e-12,
        );
        assert.ok(
          delta > 0
            ? scenario.predicted <= forecast.predicted
            : scenario.predicted >= forecast.predicted,
        );
        assert.ok(
          Math.abs(scenario.applied_change_pp) <= Math.abs(delta) + 1e-10,
        );
        if (delta === 100)
          assert.deepEqual(
            [scenario.predicted, scenario.lower, scenario.upper],
            [0, 0, 0],
          );
        if (delta === -100)
          assert.deepEqual(
            [scenario.predicted, scenario.lower, scenario.upper],
            [1, 1, 1],
          );
      }
    }
});

test("fronteras inclusivas del semáforo e incertidumbre al cruzar categorías", () => {
  const model = structuredClone(report.models[0]);
  model.calibration.risk.thresholds = [0.4, 0.6];
  const forecast = {
    ...model.forecasts[0],
    predicted: 0.6,
    lower: 0.4,
    upper: 0.8,
  };
  const base = mlScenario(forecast, model, 0);
  assert.equal(base.risk_level, "high");
  assert.equal(base.classification_uncertain, true);
  const middle = mlScenario(
    { ...forecast, predicted: 0.4, lower: 0.4, upper: 0.4 },
    model,
    0,
  );
  assert.equal(middle.risk_level, "medium");
  assert.equal(middle.classification_uncertain, false);
});

test("valores no finitos y cambios superiores a cien puntos se rechazan", () => {
  const model = report.models[0];
  for (const delta of [NaN, Infinity, -Infinity, -101, 101]) {
    assert.throws(
      () => mlScenario(model.forecasts[0], model, delta),
      /fuera de rango/,
    );
  }
});
