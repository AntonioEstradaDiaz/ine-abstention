import { test, expect, type Page } from "@playwright/test";

async function chooseTerritory(page: Page, code: string) {
  await page
    .getByRole("button", { name: "Filtros", exact: true })
    .isVisible()
    .then(async (visible) => {
      await page
        .getByRole("button", {
          name: visible ? "Filtros" : "Cambiar territorio",
          exact: true,
        })
        .click();
    });
  await page
    .getByLabel("Territorio seleccionado", { exact: true })
    .selectOption(code);
}

test("dashboard uses live backend data, maps and historical periods", async ({
  page,
  request,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  const direct = await request.get(
    "http://127.0.0.1:8001/api/v1/predictions?target_year=2027&limit=100",
  );
  expect(direct.ok()).toBeTruthy();
  const predictions = await direct.json();
  expect(predictions.items).toHaveLength(32);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Riesgo de Abstención Electoral" }),
  ).toBeVisible();
  await expect(
    page.getByText("Backend conectado", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(32);
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByText("Cargando cartografía oficial…")).toHaveCount(0);
  await expect(
    page.getByText("Mapa no disponible.", { exact: false }),
  ).toHaveCount(0);
  // Las coordenadas de la prueba corresponden a la vista plana, sin perspectiva.
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(
    page.locator('[data-map-mode="2d"][data-camera-moving="false"]'),
  ).toBeVisible();
  // Project an interior point of Baja California using the map's initial Mercator fit.
  const canvas = page.locator(".maplibregl-canvas");
  const box = (await canvas.boundingBox())!;
  const mercatorY = (latitude: number) =>
    (1 -
      Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)) / Math.PI) /
    2;
  const top = mercatorY(33),
    bottom = mercatorY(14);
  const scale = Math.min(
    (box.width - 70) / (32.5 / 360),
    (box.height - 70) / (bottom - top),
  );
  await canvas.click({
    position: {
      x: box.width / 2 + ((-115.5 + 102.25) / 360) * scale,
      y: box.height / 2 + (mercatorY(30.5) - (top + bottom) / 2) * scale,
    },
  });
  await expect(page.locator(".territory-metrics")).toHaveAttribute(
    "data-territory-code",
    "02",
  );
  await expect(
    page.getByRole("button", { name: "Acercar", exact: true }),
  ).toBeVisible();
  await chooseTerritory(page, "02");
  await expect(page.locator(".territory-detail h2")).toHaveText(
    "Baja California",
  );
  const selected = predictions.items.find(
    (p: { state_code: string }) => p.state_code === "02",
  );
  await expect(
    page.locator(".territory-gauge > .detail-rate-value"),
  ).toHaveText(`${(selected.predicted * 100).toFixed(1)}%`);
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await page.getByLabel("Año histórico", { exact: true }).selectOption("2024");
  await expect(
    page.getByRole("heading", { name: "Abstención observada · 2024" }),
  ).toBeVisible();
  const observed = await (
    await request.get(
      "http://127.0.0.1:8001/api/v1/statistics/territories?year=2024&territory_type=state&limit=100",
    )
  ).json();
  const observedState = observed.items.find(
    (r: { state_code?: string; official_code: string }) =>
      (r.state_code || r.official_code) === "02",
  );
  await expect(
    page.locator(".territory-gauge > .detail-rate-value"),
  ).toHaveText(`${(observedState.abstention_rate * 100).toFixed(1)}%`);
  await page.getByLabel("Buscar estado en la tabla").fill("Baja");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("pulso-2024.csv");
  await page.screenshot({
    path: "test-results/map-desktop.png",
    fullPage: true,
  });
  expect(failures).toEqual([]);
});

test("trends compare only matching elections and retain territorial selection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Backend conectado", { exact: true }),
  ).toBeVisible();
  await chooseTerritory(page, "02");
  await page
    .getByRole("button", { name: "Comparar históricos", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(page.locator("tbody")).toContainText("2021");
  await expect(page.locator("tbody")).not.toContainText("2024");
  await page.getByLabel("Añadir estado a la comparación").selectOption("17");
  await page.getByLabel("Añadir estado a la comparación").selectOption("31");
  await expect(
    page.getByLabel("Añadir estado a la comparación"),
  ).toBeDisabled();
  await expect(page.locator("tbody tr")).toHaveCount(9);
  await page
    .getByLabel("Tipo de elección", { exact: true })
    .selectOption("presidential");
  await expect(page.locator("tbody")).toContainText("2024");
  await expect(page.locator("tbody")).not.toContainText("2021");
  await page
    .getByRole("button", { name: "Participación", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Participación histórica por estado",
      exact: false,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/trends-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Predicciones", exact: true }).click();
  await expect(page.locator(".territory-metrics")).toHaveAttribute(
    "data-territory-code",
    "02",
  );
  await expect(page.locator(".forecast-card h2")).toHaveText("BAJA CALIFORNIA");
  await expect(
    page.getByText("MAE prueba 2024", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".model-stats")).toContainText("3.49 pp");
  await page.screenshot({
    path: "test-results/predictions-desktop.png",
    fullPage: true,
  });
});

test("simulator persists real API results, clears stale outputs, clips and resets", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Backend conectado", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Escenarios", exact: true }).click();
  const responsePromise = page.waitForResponse(
    (r) =>
      r.url().includes("/api/backend/simulations") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Calcular escenario", exact: true })
    .click();
  const response = await responsePromise;
  expect([200, 201]).toContain(response.status());
  const saved = await response.json();
  const row = saved.result.states[0];
  expect(row.state_code).toBe("17");
  expect(row.applied_participation_change_pp).toBeCloseTo(3);
  expect(row.scenario.abstention_rate).toBeCloseTo(
    row.baseline.abstention_rate - 0.03,
  );
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  await expect(page.locator(".scenario-active > strong")).toHaveText(
    `${(row.scenario.abstention_rate * 100).toFixed(1)}%`,
  );
  const record = await request.get(
    `http://127.0.0.1:8001/api/v1/simulations/${saved.id}`,
  );
  expect(record.ok()).toBeTruthy();
  expect((await record.json()).id).toBe(saved.id);
  await page.screenshot({
    path: "test-results/scenario-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("Cambio hipotético en participación", { exact: true })
    .fill("100");
  await expect(
    page.getByText("Los parámetros cambiaron.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Guardado", { exact: true })).toHaveCount(0);
  const clippedPromise = page.waitForResponse(
    (r) =>
      r.url().includes("/api/backend/simulations") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Calcular escenario", exact: true })
    .click();
  const clipped = await (await clippedPromise).json();
  expect(clipped.result.states[0].point_was_clipped).toBe(true);
  await expect(page.locator(".scenario-active > strong")).toHaveText("0.0%");
  await page.getByRole("button", { name: "Restablecer", exact: true }).click();
  await expect(
    page.getByLabel("Cambio hipotético en participación", { exact: true }),
  ).toHaveValue("0");
  await expect(page.getByText("Guardado", { exact: true })).toHaveCount(0);
  await page
    .getByLabel("Cambio hipotético en participación", { exact: true })
    .fill("");
  await expect(
    page.getByRole("button", { name: "Calcular escenario", exact: true }),
  ).toBeDisabled();
  await chooseTerritory(page, "31");
  await expect(
    page.getByLabel("Cambio hipotético en participación", { exact: true }),
  ).toHaveValue("3");
});

test("offline and empty states never substitute invented values", async ({
  page,
}) => {
  await page.route("**/api/backend/predictions?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Backend sin conexión. Error de prueba.",
      }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByText("Backend sin conexión", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".territory-metrics")
      .getByRole("heading", { name: "Selecciona un estado", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reintentar", exact: true }).first(),
  ).toBeVisible();
  await page.unroute("**/api/backend/predictions?**");
  await page
    .getByRole("button", { name: "Reintentar", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Backend conectado", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Buscar estado en la tabla").fill("sin-coincidencias");
  await expect(
    page.getByText("No hay datos para esta selección.", { exact: true }),
  ).toBeVisible();
});

test("mobile layout, keyboard dialog and reduced motion remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("tbody tr")).toHaveCount(32);
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible({
    timeout: 45_000,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const trigger = page.getByRole("button", {
    name: "Metodología y fuentes",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.screenshot({
    path: "test-results/map-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Escenarios", exact: true }).click();
  await page
    .getByRole("button", { name: "Calcular escenario", exact: true })
    .click();
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/scenario-mobile.png",
    fullPage: true,
  });
});

test("proxy restricts unknown paths and cross-origin writes", async ({
  request,
}) => {
  expect((await request.get("/api/backend/unknown")).status()).toBe(404);
  expect(
    (
      await request.post("/api/backend/simulations", {
        headers: { Origin: "https://untrusted.example" },
        data: { participation_change_pp: 3 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/backend/simulations", {
        headers: { "Content-Type": "text/plain" },
        data: "{}",
      })
    ).status(),
  ).toBe(415);
});
