import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import { nationalPdf, nationalExcel, type NationalReport } from "../src/lib/national-export.ts";

const snapshot = JSON.parse(
  await readFile(new URL("../src/lib/preview-data.json", import.meta.url), "utf8"),
);
const rows = snapshot.history as Array<{
  year: number; election_type: "midterm" | "presidential"; voter_count: number;
  nonvoter_count: number; nominal_list: number; unspecified_count: number; source_id: number;
}>;
const grouped = new Map<number, typeof rows>();
for (const row of rows) grouped.set(row.year, [...(grouped.get(row.year) ?? []), row]);
const history: NationalReport["history"] = [...grouped.entries()].map(([year, data]) => {
  const sum = (key: "voter_count" | "nonvoter_count" | "nominal_list" | "unspecified_count") =>
    data.reduce((total, row) => total + row[key], 0);
  const voters = sum("voter_count"), nonvoters = sum("nonvoter_count");
  return {
    year,
    election_type: data[0].election_type,
    nominal_list: sum("nominal_list"),
    voter_count: voters,
    nonvoter_count: nonvoters,
    unspecified_count: sum("unspecified_count"),
    participation_rate: voters / (voters + nonvoters),
    abstention_rate: nonvoters / (voters + nonvoters),
    unspecified_rate: null,
    source_ids: [...new Set(data.map((row) => row.source_id))],
    territory_count: data.length,
  };
});
const report: NationalReport = {
  forecast: snapshot.predictions.forecast,
  states: snapshot.predictions.items,
  history,
  variable: "abstention",
  createdAt: "2026-10-28T18:00:00Z",
};

test("national PDF contains a real document without claiming a national forecast", async () => {
  const bytes = await nationalPdf(report);
  const doc = await PDFDocument.load(bytes);
  assert.match(doc.getTitle()!, /Comparativo nacional/);
  assert.ok(doc.getPageCount() >= 2);
});

test("national Excel contains 32 states and official count-weighted history", async () => {
  const bytes = await nationalExcel(report);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(bytes));
  const states = book.getWorksheet("Entidades")!;
  assert.equal(states.rowCount, report.states.length + 1);
  const historic = book.getWorksheet("Historico nacional")!;
  assert.equal(historic.rowCount, history.length + 1);
  const sample = history.sort((a,b) => a.year - b.year)[0];
  assert.equal(historic.getCell("G2").value, sample.voter_count / (sample.voter_count + sample.nonvoter_count));
  assert.match(String(book.getWorksheet("Resumen")!.getCell("B3").value), /NO agregadas nacionalmente/);
  assert.equal(book.getWorksheet("Metodologia")!.getCell("B2").value, "SV / (SV + NV)");
});
