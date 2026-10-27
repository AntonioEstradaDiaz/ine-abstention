import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analysisRates,
  comparableElections,
  participationChange,
} from "../src/lib/analysis.ts";

test("official rates exclude NS, preserve zero and never invent empty values", () => {
  assert.deepEqual(analysisRates({ voter_count: 40, nonvoter_count: 60 }), {
    participation: 0.4,
    abstention: 0.6,
  });
  assert.deepEqual(analysisRates({ voter_count: 0, nonvoter_count: 80 }), {
    participation: 0,
    abstention: 1,
  });
  assert.equal(analysisRates({ voter_count: 0, nonvoter_count: 0 }), null);
  assert.equal(analysisRates({ voter_count: -1, nonvoter_count: 10 }), null);
  assert.equal(analysisRates({ voter_count: NaN, nonvoter_count: 10 }), null);
  assert.equal(analysisRates(undefined), null);
  assert.equal(
    participationChange(
      { voter_count: 40, nonvoter_count: 60 },
      { voter_count: 30, nonvoter_count: 70 },
    )!.toFixed(1),
    "10.0",
  );
  assert.equal(
    participationChange(
      { voter_count: 0, nonvoter_count: 0 },
      { voter_count: 30, nonvoter_count: 70 },
    ),
    null,
  );
});

test("comparison periods exclude the other election type and future elections", () => {
  const elections = [2009, 2012, 2015, 2018, 2021, 2024].map((year) => ({
    id: year,
    year,
    election_type:
      (year - 2012) % 6 === 0
        ? ("presidential" as const)
        : ("midterm" as const),
  }));
  assert.deepEqual(
    comparableElections(elections, 2024).map((e) => e.year),
    [2012, 2018, 2024],
  );
  assert.deepEqual(
    comparableElections(elections, 2021).map((e) => e.year),
    [2009, 2015, 2021],
  );
  assert.deepEqual(
    comparableElections(elections, 2009).map((e) => e.year),
    [2009],
  );
  assert.deepEqual(comparableElections(elections, 2027), []);
});
