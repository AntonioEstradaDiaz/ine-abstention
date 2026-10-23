import { test, expect } from "@playwright/test";

test("lower dashboard uses forecast values and carries the selected scenario assumption", async ({
  page,
  request,
}) => {
  const response = await request.get(
    "/api/backend/predictions?target_year=2027&limit=100",
  );
  expect(response.ok()).toBeTruthy();
  const { items } = await response.json();
  await page.goto("/");
  await expect(
    page.locator(
      ".preview-banner,.design-data-note,.observed-indicators,.global-filters",
    ),
  ).toHaveCount(0);
  await expect(page.locator('[data-name="Indicador electoral"]')).toHaveCount(
    4,
  );
  await expect(page.locator(".territory-table")).toHaveCount(0);
  const lower = page.getByRole("region", {
    name: "Resumen del análisis territorial",
    exact: true,
  });
  await expect(lower.locator(":scope > article")).toHaveCount(4);
  const base =
    1 -
    items.find((p: { state_code: string }) => p.state_code === "17").predicted;
  await expect(
    lower.locator(".lower-scenario-pair > div").first().locator("strong"),
  ).toHaveText(`${(base * 100).toFixed(1)}%`);
  await lower
    .getByRole("combobox", { name: "Supuesto de participación" })
    .click();
  await page
    .getByRole("option", {
      name: "Supuesto: −3 pp de participación",
      exact: true,
    })
    .click();
  await expect(lower.locator(".lower-scenario-result strong")).toHaveText(
    `${(Math.max(0, base - 0.03) * 100).toFixed(1)}%`,
  );
  await lower
    .getByRole("button", { name: "Comparar escenarios", exact: true })
    .click();
  await expect(
    page.getByRole("spinbutton", {
      name: "Cambio hipotético en participación",
      exact: true,
    }),
  ).toHaveValue("-3");
});

test("territorial metrics follow Guerrero and Baja California, including the historical view", async ({
  page,
  request,
}) => {
  const forecastsResponse = await request.get(
    "/api/backend/predictions?target_year=2027&limit=100",
  );
  expect(forecastsResponse.ok()).toBeTruthy();
  const forecasts = (await forecastsResponse.json()).items;
  const observedResponse = await request.get(
    "/api/backend/statistics/territories?year=2024&territory_type=state&limit=100",
  );
  expect(observedResponse.ok()).toBeTruthy();
  const observed = (await observedResponse.json()).items;
  const rate = (v: number) =>
    `${(v * 100).toLocaleString("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  await page.goto("/");
  const panel = page.getByRole("complementary", {
    name: "Detalle del territorio",
    exact: true,
  });
  for (const [code, name] of [
    ["12", "Guerrero"],
    ["02", "Baja California"],
  ]) {
    const forecast = forecasts.find(
      (r: { state_code: string }) => r.state_code === code,
    );
    const actual = observed.find(
      (r: { state_code?: string; official_code: string }) =>
        (r.state_code || r.official_code) === code,
    );
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    await page
      .getByRole("combobox", { name: "Territorio seleccionado", exact: true })
      .click();
    await page.getByRole("option", { name, exact: true }).click();
    await expect(panel).toHaveAttribute("data-territory-code", code);
    await expect(
      panel.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(panel.locator(".detail-rate-value")).toHaveText(
      rate(forecast.predicted),
    );
    await expect(
      panel.locator(".territory-stat-cards > div").nth(0).locator("strong"),
    ).toHaveText(rate(actual.participation_rate));
    await expect(
      panel.locator(".territory-stat-cards > div").nth(1).locator("strong"),
    ).toHaveText(actual.nonvoter_count.toLocaleString("es-MX"));
  }
  await panel.getByRole("tab", { name: "Histórico", exact: true }).click();
  await expect(panel.locator(".territory-history-row")).toHaveCount(3);
  await expect(panel.locator(".territory-history-series")).toContainText(
    "2021",
  );
  await expect(panel.locator(".territory-history-series")).not.toContainText(
    "2024",
  );
  await panel
    .getByRole("button", { name: "Presidenciales", exact: true })
    .click();
  await expect(panel.locator(".territory-history-row")).toHaveCount(3);
  await expect(panel.locator(".territory-history-series")).toContainText(
    "2024",
  );
  await expect(panel.locator(".territory-history-series")).not.toContainText(
    "2021",
  );
  await panel.getByRole("tab", { name: "Factores", exact: true }).click();
  await expect(panel.getByRole("tabpanel")).toContainText(
    "no representan causas ni importancia de variables",
  );
  await panel
    .getByRole("tab", { name: "Recomendaciones", exact: true })
    .click();
  await expect(panel.getByRole("tabpanel")).toContainText("Baja California");
  await panel.getByRole("tab", { name: "Resumen", exact: true }).click();
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  const actual = observed.find(
    (r: { state_code?: string; official_code: string }) =>
      (r.state_code || r.official_code) === "02",
  );
  await expect(panel.locator(".detail-rate-value")).toHaveText(
    rate(actual.abstention_rate),
  );
});

test("ZIP header assets and four cards fit phone, tablet and desktop widths", async ({
  page,
}) => {
  await page.goto("/");
  for (const width of [320, 390, 768, 1043, 1500]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('[data-name="Indicador electoral"]')).toHaveCount(
      4,
    );
    await expect(
      page.getByRole("button", { name: "Filtros", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await expect(
      page.getByRole("img", { name: "INE · Instituto Nacional Electoral" }),
    ).toBeVisible();
    for (const img of await page.locator(".design-top img:visible").all()) {
      await expect(img).toBeVisible();
      expect(
        await img.evaluate(
          (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
        ),
      ).toBeTruthy();
    }
  }
});
