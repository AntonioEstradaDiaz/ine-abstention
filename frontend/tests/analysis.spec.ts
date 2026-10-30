import { test, expect, type Page } from "@playwright/test";
const choose = async (page: Page, label: string, option: string) => {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

test("official analysis agrees with observed map, forecasts and weighted national data", async ({
  page,
  request,
}) => {
  const predictions = (
    await (
      await request.get("/api/backend/predictions?target_year=2027&limit=100")
    ).json()
  ).items;
  const indicators = (
    await (
      await request.get(
        "/api/backend/statistics/territories?year=2024&territory_type=state&limit=100",
      )
    ).json()
  ).items;
  const voters = indicators.reduce(
    (sum: number, row: { voter_count: number }) => sum + row.voter_count,
    0,
  );
  const nonvoters = indicators.reduce(
    (sum: number, row: { nonvoter_count: number }) => sum + row.nonvoter_count,
    0,
  );
  const national = voters / (voters + nonvoters);
  // Verify the published state rates against underlying counts for every entity.
  expect(indicators).toHaveLength(32);
  for (const row of indicators) {
    expect(row.participation_rate).toBeCloseTo(
      row.voter_count / (row.voter_count + row.nonvoter_count),
      12,
    );
    expect(row.abstention_rate).toBeCloseTo(
      row.nonvoter_count / (row.voter_count + row.nonvoter_count),
      12,
    );
  }
  await page.goto("/");
  await page.getByRole("button", { name: "Análisis IA", exact: true }).click();
  for (const [code, name] of [
    ["17", "Morelos"],
    ["02", "Baja California"],
    ["12", "Guerrero"],
  ]) {
    await choose(page, "Territorio del análisis", name);
    const official = indicators.find(
      (row: { state_code: string }) => row.state_code === code,
    );
    const forecast = predictions.find(
      (row: { state_code: string }) => row.state_code === code,
    );
    const observed =
      official.voter_count / (official.voter_count + official.nonvoter_count);
    await expect(
      page.getByRole("article", {
        name: "Participación observada 2024",
        exact: true,
      }),
    ).toContainText(pct(observed));
    await expect(
      page.getByRole("article", {
        name: "Abstención observada 2024",
        exact: true,
      }),
    ).toContainText(pct(1 - observed));
    const history = page.getByRole("table", {
      name: "Histórico oficial del estado y nacional",
      exact: true,
    });
    await expect(
      history.locator("tbody tr").last().locator("td").nth(3),
    ).toHaveText(pct(national));
    await expect(history).not.toContainText("2021");
    await expect(
      page.getByText("Datos ilustrativos", { exact: true }),
    ).toHaveCount(0);
    await choose(page, "Datos del análisis", "Estimación 2027");
    await expect(
      page.getByRole("article", {
        name: "Abstención estimada 2027",
        exact: true,
      }),
    ).toContainText(pct(forecast.predicted));
    await expect(
      page.getByRole("article", {
        name: "Banda de abstención 2027",
        exact: true,
      }),
    ).toContainText(`${pct(forecast.lower)} – ${pct(forecast.upper)}`);
    await page
      .getByRole("button", { name: "Predicciones", exact: true })
      .click();
    await expect(page.locator(".forecast-card h2")).toHaveText(forecast.name);
    await expect(
      page.getByRole("article", {
        name: "Abstención estimada 2027",
        exact: true,
      }),
    ).toContainText(pct(forecast.predicted));
    await page
      .getByRole("button", { name: "Mapa de riesgo", exact: true })
      .click();
    await page.getByRole("button", { name: "Estimación", exact: true }).click();
    await expect(
      page.locator('[data-name="Indicadores clave"]').getByRole("article", {
        name: "Abstención estimada 2027",
        exact: true,
      }),
    ).toContainText(pct(forecast.predicted));
    await page.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(
      page.locator(".territory-metrics .detail-rate-value"),
    ).toHaveText(pct(1 - observed));
    await page
      .getByRole("button", { name: "Análisis IA", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", {
        name: "Territorio del análisis",
        exact: true,
      }),
    ).toHaveText(name);
  }
  await choose(page, "Año del análisis", "2021 · Intermedia");
  const history = page.getByRole("table", {
    name: "Histórico oficial del estado y nacional",
    exact: true,
  });
  await expect(history).toContainText("2021");
  await expect(history).not.toContainText("2024");
  await choose(page, "Periodo del análisis", "Periodo: 2009 – 2021");
  await expect(history.locator("tbody tr")).toHaveCount(3);
  await expect(history).not.toContainText("2018");
  await page.screenshot({
    path: "test-results/analysis-official-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/analysis-official-mobile.png",
    fullPage: true,
  });
});

test("analysis exports official counts and shows failures without illustrative fallback", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Análisis IA", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Buscar estado del análisis", exact: true })
    .fill("baja");
  await expect(
    page
      .getByRole("table", {
        name: "Detalle estatal observado 2024",
        exact: true,
      })
      .locator("tbody tr"),
  ).toHaveCount(2);
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar análisis", exact: true })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("analisis-oficial-2024.csv");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain('"SV","NV","NS","Lista nominal"');
  expect(csv).toContain('"Baja California"');
  expect(csv).not.toContain('"Morelos"');
  expect(csv).not.toContain("ilustrativ");
  expect(csv.trim().split(/\r?\n/)).toHaveLength(3);
  await page.route("**/api/backend/statistics/territories?**", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Datos oficiales temporalmente no disponibles." },
    }),
  );
  await page.reload();
  await page.getByRole("button", { name: "Análisis IA", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Datos oficiales temporalmente no disponibles." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Exportar análisis", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".analysis-kpis")).toHaveCount(0);
});
