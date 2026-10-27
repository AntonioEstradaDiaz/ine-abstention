import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import {
  reportPdf,
  reportExcel,
  type StateReport,
} from "../src/lib/report-export.ts";

const snapshot = JSON.parse(
  await readFile(
    new URL("../src/lib/preview-data.json", import.meta.url),
    "utf8",
  ),
);
const state = snapshot.predictions.items.find(
  (s: { state_code: string }) => s.state_code === "02",
);
const report: StateReport = {
  title: "Análisis por entidad",
  state,
  forecast: snapshot.predictions.forecast,
  history: snapshot.history.filter(
    (r: { state_code: string }) => r.state_code === "02",
  ),
  national: [],
  variable: "abstention",
  summary: ["Estimación experimental, sin interpretación causal."],
  charts: true,
  createdAt: "2026-10-27T01:00:00.000Z",
};
test("PDF is a real multipage document with selected entity metadata", async () => {
  const bytes = await reportPdf(report);
  const pdf = await PDFDocument.load(bytes);
  assert.match(pdf.getTitle()!, /BAJA CALIFORNIA/i);
  assert.ok(pdf.getPageCount() >= 1 && pdf.getPageCount() <= 3);
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/hackathon-report.pdf", bytes);
});
test("Excel preserves official counts and numeric rates, plus model provenance", async () => {
  const bytes = await reportExcel(report);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(bytes));
  const summary = book.getWorksheet("Resumen")!;
  assert.equal(summary.getCell("B2").value, state.name);
  assert.equal(summary.getCell("B7").value, state.predicted);
  assert.equal(summary.getCell("B7").numFmt, "0.0%");
  const history = book.getWorksheet("Historico")!;
  assert.equal(history.rowCount, report.history.length + 1);
  assert.equal(history.getCell("D2").value, report.history[0].voter_count);
  assert.equal(history.getCell("E2").value, report.history[0].nonvoter_count);
  assert.equal(
    history.getCell("H2").value,
    report.history[0].participation_rate,
  );
  assert.equal(
    book.getWorksheet("Metodologia")!.getCell("B2").value,
    report.forecast.id,
  );
  await writeFile("test-results/hackathon-report.xlsx", bytes);
});
