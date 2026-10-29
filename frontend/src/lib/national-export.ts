import type { Forecast, Prediction, Summary } from "./types";
import type { ReportFormat } from "./report-export";

export type NationalReport = {
  forecast: Forecast;
  states: Prediction[];
  history: Summary["items"];
  variable: "abstention" | "participation";
  createdAt: string;
};

const pct = (value: number | null) =>
  value == null ? "Sin datos" : `${(value * 100).toFixed(1)}%`;
const kind = (type: string) =>
  type === "midterm" ? "Intermedia" : "Presidencial";
const risk = { high: "Alto", medium: "Medio", low: "Bajo" };
const limits =
  "Prototipo independiente del INE. Las predicciones 2027 son estatales, experimentales y no causales. No se publica una prediccion nacional agregada; no se deben promediar tasas estatales para inferirla. Las series historicas nacionales proceden de SV/(SV+NV) y NV/(SV+NV); NS se presenta por separado. Comparar elecciones del mismo tipo.";

export async function nationalPdf(report: NationalReport): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle("Pulso electoral · Comparativo nacional");
  doc.setAuthor("Pulso electoral");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pink = rgb(0.77, 0, 0.42);
  const ink = rgb(0.06, 0.12, 0.23);
  let page = doc.addPage([595.28, 841.89]);
  let y = 793;
  const line = (text: string, size = 10, isBold = false) => {
    const face = isBold ? bold : font;
    const words = text.replace(/[\u0000-\u001f]/g, " ").split(/\s+/);
    let current = "";
    const draw = (value: string) => {
      if (y < 65) {
        page = doc.addPage([595.28, 841.89]);
        y = 793;
      }
      page.drawText(value, { x: 48, y, size, font: face, color: isBold ? pink : ink });
      y -= size + 5;
    };
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (face.widthOfTextAtSize(next, size) > 494 && current) {
        draw(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) draw(current);
    y -= 5;
  };
  line("PULSO ELECTORAL", 13, true);
  line("Comparativo nacional", 22, true);
  line(`Generado: ${new Date(report.createdAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`);
  line(`Pronosticos territoriales ${report.forecast.target_year} · ${report.states.length} entidades disponibles`);
  line("No representa una prediccion nacional ponderada.", 10, true);
  line("Historico nacional observado · agregado de conteos oficiales", 13, true);
  for (const row of [...report.history].sort((a, b) => a.year - b.year)) {
    const denominator = row.voter_count + row.nonvoter_count;
    if (!denominator) continue;
    line(`${row.year} · ${kind(row.election_type)} · SV ${row.voter_count.toLocaleString("es-MX")} · NV ${row.nonvoter_count.toLocaleString("es-MX")} · NS ${row.unspecified_count.toLocaleString("es-MX")}`, 9);
    line(`Participacion ${pct(row.voter_count / denominator)} · Abstencion ${pct(row.nonvoter_count / denominator)} · Fuentes ${row.source_ids.join(", ")}`, 9);
  }
  line("Comparacion de las 32 estimaciones estatales", 13, true);
  line("Entidad · Abstencion estimada · Banda de referencia · Riesgo", 9, true);
  for (const state of [...report.states].sort((a, b) => b.predicted - a.predicted)) {
    line(`${state.state_code} ${state.name} · ${pct(state.predicted)} · ${pct(state.lower)} a ${pct(state.upper)} · ${risk[state.risk_level]}`, 9);
  }
  line("Procedencia y limitaciones", 13, true);
  line(`Corrida ${report.forecast.id} · Modelo ${report.forecast.provenance.model_name} · Corte ${report.forecast.as_of_year}`, 9);
  line("Fuentes: INE, Conteos Censales de Participacion Ciudadana (CCPC).", 9);
  line(limits, 9);
  doc.getPages().forEach((p, i, all) => {
    p.drawText(`Pulso electoral · ${i + 1} / ${all.length}`, {
      x: 48, y: 30, size: 8, font, color: ink,
    });
  });
  return doc.save();
}

export async function nationalExcel(report: NationalReport): Promise<Uint8Array> {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Pulso electoral";
  book.created = new Date(report.createdAt);
  const cover = book.addWorksheet("Resumen");
  cover.addRows([
    ["PULSO", "Comparativo nacional"],
    ["Generado", report.createdAt],
    ["Predicciones", "Solo por entidad; NO agregadas nacionalmente"],
    ["Entidades", report.states.length],
    ["Año de pronóstico", report.forecast.target_year],
    ["Corrida", report.forecast.id],
    ["Modelo", report.forecast.provenance.model_name],
    ["Corte", report.forecast.as_of_year],
    ["AVISO", "Modelo experimental, sin aval institucional INE"],
  ]);
  const states = book.addWorksheet("Entidades", { views: [{ state: "frozen", ySplit: 1 }] });
  states.addRow(["Código", "Entidad", "Abstención 2027", "Participación 2027", "Banda inferior", "Banda superior", "Riesgo"]);
  for (const item of [...report.states].sort((a, b) => b.predicted - a.predicted)) {
    const row = states.addRow([item.state_code, item.name, item.predicted, 1 - item.predicted, item.lower, item.upper, risk[item.risk_level]]);
    for (let col = 3; col <= 6; col++) row.getCell(col).numFmt = "0.0%";
  }
  states.autoFilter = { from: "A1", to: "G1" };
  const history = book.addWorksheet("Historico nacional", { views: [{ state: "frozen", ySplit: 1 }] });
  history.addRow(["Año", "Tipo", "SV", "NV", "NS", "Lista nominal", "Participación", "Abstención", "Fuentes oficiales", "Entidades"]);
  for (const item of [...report.history].sort((a, b) => a.year - b.year)) {
    const denom = item.voter_count + item.nonvoter_count;
    if (!denom) continue;
    const row = history.addRow([item.year, kind(item.election_type), item.voter_count, item.nonvoter_count, item.unspecified_count, item.nominal_list, item.voter_count / denom, item.nonvoter_count / denom, item.source_ids.join(", "), item.territory_count]);
    row.getCell(7).numFmt = "0.0%";
    row.getCell(8).numFmt = "0.0%";
  }
  history.autoFilter = { from: "A1", to: "J1" };
  const method = book.addWorksheet("Metodologia");
  method.addRows([
    ["Concepto", "Detalle"],
    ["Participación observada", "SV / (SV + NV)"],
    ["Abstención observada", "NV / (SV + NV)"],
    ["NS", "Se informa aparte del denominador de participación conocida"],
    ["Tasa nacional", "Suma de conteos oficiales, nunca promedio simple de estados"],
    ["Predicciones", "Predicciones por estado, sin extrapolación a tasa nacional"],
    ["Fuente", "INE · CCPC"],
    ["Corrida", report.forecast.id],
    ["Limitaciones", limits],
  ]);
  for (const sheet of book.worksheets) {
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC4006B" } };
    sheet.columns.forEach((col, i) => { col.width = i === 1 ? 40 : i === 0 ? 27 : 23; });
    sheet.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}

export async function downloadNationalReport(
  report: NationalReport,
  format: ReportFormat,
): Promise<void> {
  const bytes = format === "pdf" ? await nationalPdf(report) : await nationalExcel(report);
  const blob = new Blob([new Uint8Array(bytes)], {
    type: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pulso-reporte-nacional-${report.forecast.target_year}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
