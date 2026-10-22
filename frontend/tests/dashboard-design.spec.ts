import { test, expect } from "@playwright/test";

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
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
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
    await page
      .getByLabel("Territorio seleccionado", { exact: true })
      .selectOption(code);
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
  await expect(panel.locator("tbody tr")).toHaveCount(6);
  await panel.getByRole("tab", { name: "Factores", exact: true }).click();
  await expect(panel.getByRole("tabpanel")).toContainText(
    "no son importancias de variables",
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
    for (const img of await page.locator(".design-top img").all()) {
      await expect(img).toBeVisible();
      expect(
        await img.evaluate(
          (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
        ),
      ).toBeTruthy();
    }
  }
});
