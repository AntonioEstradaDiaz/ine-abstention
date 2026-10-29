import type { Forecast, Indicator, Prediction } from "./types";

export type StateReport = {
  visualCover?: string;
  title: string;
  state: Prediction;
  forecast: Forecast;
  history: Indicator[];
  national: Array<{
    year: number;
    participation_rate: number | null;
    abstention_rate: number | null;
  }>;
  variable: string;
  summary: string[];
  charts: boolean;
  createdAt: string;
};
export type ReportFormat = "pdf" | "xlsx";
const percentage = (value: number | null) =>
  value == null ? "Sin datos" : `${(value * 100).toFixed(1)}%`;
const kind = (value: string) =>
  value === "midterm" ? "Intermedia" : "Presidencial";
const risk = { high: "Alto", medium: "Medio", low: "Bajo" };
const limitations =
  "Prototipo experimental, sin aval institucional del INE. Estimación no causal; banda empírica sin cobertura futura garantizada. NS queda fuera del denominador SV + NV. Comparar elecciones del mismo tipo.";
const rate = (
  report: StateReport,
  row: { participation_rate: number | null; abstention_rate: number | null },
) =>
  report.variable === "participation"
    ? row.participation_rate
    : row.abstention_rate;

export async function reportPdf(report: StateReport): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`${report.title} · ${report.state.name}`);
  doc.setAuthor("Pulso electoral");
  if (report.visualCover) {
    const cover = await doc.embedPng(report.visualCover);
    const page = doc.addPage([595.28, 841.89]);
    const scale = Math.min(555.28 / cover.width, 771.89 / cover.height);
    const width = cover.width * scale, height = cover.height * scale;
    page.drawImage(cover, { x: (595.28 - width) / 2, y: 821.89 - height, width, height });
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.12, 0.24),
    pink = rgb(0.78, 0, 0.39);
  let page = doc.addPage([595.28, 841.89]),
    y = 790;
  const text = (value: string, size = 10, strong = false) => {
    // Wrap with font metrics so Spanish entity names and provenance never clip.
    const selected = strong ? bold : font;
    let line = "";
    for (const word of value.replace(/[\u0000-\u001f]/g, " ").split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (selected.widthOfTextAtSize(next, size) > 491 && line) {
        draw(line);
        line = word;
      } else line = next;
    }
    if (line) draw(line);
    y -= 6;
    function draw(line: string) {
      if (y < 65) {
        page = doc.addPage([595.28, 841.89]);
        y = 790;
      }
      page.drawText(line, {
        x: 52,
        y,
        size,
        font: selected,
        color: strong ? pink : ink,
      });
      y -= size + 5;
    }
  };
  text("PULSO ELECTORAL", 12, true);
  text(report.title, 22, true);
  text(report.state.name, 18, true);
  text(
    `Reporte estatal · ${new Date(report.createdAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}`,
  );
  text(
    `Estimación ${report.forecast.target_year} · ${kind(report.forecast.election_type)}`,
    13,
    true,
  );
  text(
    `Participación: ${percentage(1 - report.state.predicted)} · Abstención: ${percentage(report.state.predicted)}`,
  );
  text(
    `Banda de abstención: ${percentage(report.state.lower)} a ${percentage(report.state.upper)} · Riesgo relativo: ${risk[report.state.risk_level]}`,
  );
  if (report.summary.length) {
    text("Hallazgos", 13, true);
    for (const finding of report.summary) text(finding);
  }
  text(
    `Histórico observado · ${report.variable === "participation" ? "Participación" : "Abstención"}`,
    13,
    true,
  );
  for (const row of report.history) {
    const national = report.national.find((n) => n.year === row.year);
    text(
      `${row.year} · ${kind(row.election_type)} · ${percentage(rate(report, row))}${national ? ` · Nacional ponderado ${percentage(rate(report, national))}` : ""}`,
    );
    text(
      `SV ${row.voter_count.toLocaleString("es-MX")} · NV ${row.nonvoter_count.toLocaleString("es-MX")} · NS ${row.unspecified_count.toLocaleString("es-MX")} · Fuente INE CCPC ${row.year}, ID ${row.source_id}`,
      8,
    );
  }
  if (report.charts) {
    // Separate election types; no misleading line between presidential and midterm elections.
    for (const type of ["midterm", "presidential"]) {
      const rows = report.history.filter(
        (r) => r.election_type === type && rate(report, r) != null,
      );
      if (rows.length < 2) continue;
      if (y < 210) {
        page = doc.addPage([595.28, 841.89]);
        y = 790;
      }
      text(`Evolución · ${kind(type)} (0–100%)`, 11, true);
      const top = y - 5,
        bottom = top - 80;
      page.drawLine({
        start: { x: 70, y: bottom },
        end: { x: 520, y: bottom },
        color: ink,
        thickness: 0.5,
      });
      rows.forEach((row, i) => {
        const x = 80 + (i * 420) / (rows.length - 1),
          v = rate(report, row)!;
        const py = bottom + v * 80;
        page.drawCircle({ x, y: py, size: 3, color: pink });
        page.drawText(`${row.year}: ${percentage(v)}`, {
          x: x - 24,
          y: bottom - 18,
          size: 8,
          font,
          color: ink,
        });
        if (i)
          page.drawLine({
            start: {
              x: 80 + ((i - 1) * 420) / (rows.length - 1),
              y: bottom + rate(report, rows[i - 1])! * 80,
            },
            end: { x, y: py },
            thickness: 2,
            color: pink,
          });
      });
      y = bottom - 40;
    }
  }
  text("Procedencia y límites", 13, true);
  text(
    `Corrida: ${report.forecast.id} · Modelo: ${report.forecast.provenance.model_name}`,
    9,
  );
  text(
    `Corrida del modelo: ${report.forecast.provenance.model_run_id} · Corte: ${report.forecast.as_of_year}`,
    9,
  );
  text(
    "Fuente: INE, Conteos Censales de Participación Ciudadana (CCPC). https://www.ine.mx/transparencia/datos-abiertos/",
    9,
  );
  text(limitations, 9);
  doc
    .getPages()
    .forEach((p, i, all) =>
      p.drawText(`Pulso electoral · ${i + 1} / ${all.length}`, {
        x: 52,
        y: 30,
        size: 8,
        font,
        color: ink,
      }),
    );
  return doc.save();
}

export async function reportExcel(report: StateReport): Promise<Uint8Array> {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Pulso electoral";
  book.created = new Date(report.createdAt);
  const summary = book.addWorksheet("Resumen");
  summary.addRows([
    ["Pulso electoral", report.title],
    ["Entidad", report.state.name],
    ["Código de entidad", report.state.state_code],
    ["Generado", report.createdAt],
    ["Año estimado", report.forecast.target_year],
    ["Participación estimada", 1 - report.state.predicted],
    ["Abstención estimada", report.state.predicted],
    ["Banda inferior", report.state.lower],
    ["Banda superior", report.state.upper],
    ["Riesgo relativo", risk[report.state.risk_level]],
    ...report.summary.map((s) => ["Hallazgo", s]),
  ]);
  for (let r = 6; r <= 9; r++) summary.getCell(r, 2).numFmt = "0.0%";
  const history = book.addWorksheet("Historico", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  history.addRow([
    "Año",
    "Tipo",
    "Entidad",
    "SV",
    "NV",
    "NS",
    "Lista nominal",
    "Participación",
    "Abstención",
    "Nacional ponderado (variable elegida)",
    "Fuente",
  ]);
  for (const row of report.history) {
    const national = report.national.find((n) => n.year === row.year);
    const added = history.addRow([
      row.year,
      kind(row.election_type),
      report.state.name,
      row.voter_count,
      row.nonvoter_count,
      row.unspecified_count,
      row.nominal_list,
      row.participation_rate,
      row.abstention_rate,
      national ? rate(report, national) : null,
      `INE CCPC ${row.year} · ID ${row.source_id}`,
    ]);
    for (const c of [8, 9, 10]) added.getCell(c).numFmt = "0.0%";
  }
  history.autoFilter = { from: "A1", to: "K1" };
  const method = book.addWorksheet("Metodologia");
  method.addRows([
    ["Campo", "Valor"],
    ["Corrida", report.forecast.id],
    ["Modelo", report.forecast.provenance.model_name],
    ["Corrida del modelo", report.forecast.provenance.model_run_id],
    ["Corte", report.forecast.as_of_year],
    ["Variable principal", report.variable],
    ["Participación", "SV / (SV + NV)"],
    ["Abstención", "NV / (SV + NV)"],
    ["Nacional", "Suma de conteos estatales; no promedio simple de tasas"],
    ["Fuente", "INE · Conteos Censales de Participación Ciudadana"],
    ["Sitio", "https://www.ine.mx/transparencia/datos-abiertos/"],
    ["Límites", limitations],
  ]);
  for (const sheet of book.worksheets) {
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFB80060" },
    };
    sheet.columns.forEach((column, i) => {
      column.width =
        sheet === history ? (i === 2 || i === 10 ? 35 : 20) : i === 0 ? 30 : 95;
    });
    sheet.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
    });
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}

export async function downloadStateReport(
  report: StateReport,
  format: ReportFormat,
) {
  const bytes =
    format === "pdf" ? await reportPdf(report) : await reportExcel(report);
  const blob = new Blob([new Uint8Array(bytes)], {
    type:
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `pulso-reporte-${report.state.state_code}-${report.forecast.target_year}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
