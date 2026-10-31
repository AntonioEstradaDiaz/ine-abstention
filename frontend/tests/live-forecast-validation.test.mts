import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHistoricalReference } from "../src/lib/live-forecast-validation.ts";
import type { Indicator } from "../src/lib/types.ts";
const row = (year:number, nv:number, extra:Partial<Indicator> = {}) => ({territory_type:"state",state_code:"17",year,election_type:"midterm",voter_count:100-nv,nonvoter_count:nv,unspecified_count:10,source_id:year,...extra}) as Indicator;
test("reference evaluates only earlier comparable elections and selected territory",()=>{
 const r=evaluateHistoricalReference([row(2009,50),row(2015,40),row(2021,45),row(2027,90),row(2018,90,{election_type:"presidential"}),row(2021,99,{state_code:"18"})],"17","midterm",2024);
 assert.ok(!("error" in r));
 assert.equal(r.mae,7.5);
 assert.deepEqual(r.folds.map(f=>[f.referenceYear,f.year,f.estimated,f.observed]),[[2009,2015,50,40],[2015,2021,40,45]]);
 assert.equal(r.sensitivity!.lower,45/110*100);
 assert.equal(r.sensitivity!.upper,55/110*100);
});
test("reference refuses duplicates and invalid counts, and does not invent missing errors",()=>{
 assert.ok("error" in evaluateHistoricalReference([row(2021,40),row(2021,45)],"17","midterm",2024));
 assert.ok("error" in evaluateHistoricalReference([row(2021,NaN)],"17","midterm",2024));
 assert.ok("error" in evaluateHistoricalReference([],"17","midterm",2024));
 const r=evaluateHistoricalReference([row(2021,40,{unspecified_count:NaN})],"17","midterm",2024);
 assert.ok(!("error" in r)); assert.equal(r.mae,null); assert.equal(r.sensitivity,null);
});
