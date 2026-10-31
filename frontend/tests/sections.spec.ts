import { test, expect, type Page } from "@playwright/test";

const open = async (page: Page, section: string) => {
  await page.goto("/");
  await page.getByRole("button", { name: section, exact: true }).click();
};
const offlineAssistant = (page: Page) =>
  page.route("**/api/assistant", (route) =>
    route.fulfill({
      json: {
        provider: "groq",
        reachable: false,
        models: [],
        defaultModel: null,
      },
    }),
  );

test("phone navigation can reach every section without the hidden desktop menu", async ({
  page,
}) => {
  await offlineAssistant(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  for (const [section, title] of [
    ["Tendencias", "Tendencias"],
    ["Análisis IA", "Entiende la participación electoral"],
    ["Laboratorio de modelos", "Laboratorio de modelos"],
    ["Predicciones", "Predicciones de Abstención 2027"],
    ["Escenarios", "Escenarios de Participación"],
    ["Reportes", "Reportes y Documentos"],
    ["Datos", "Gestión de Datos"],
    ["Mapa de riesgo", "Riesgo de Abstención Electoral"],
  ]) {
    await page
      .getByRole("combobox", { name: "Sección de la aplicación", exact: true })
      .click();
    await page.getByRole("option", { name: section, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true, level: 1 }),
    ).toBeAttached();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: "test-results/audit-map-mobile.png",
    fullPage: true,
  });
});

test("redesigned sections share the map header and four live metric cards", async ({
  page,
}) => {
  await offlineAssistant(page);
  for (const [section, title, cards] of [
    ["Predicciones", "Predicciones de Abstención 2027", ".page-kpi"],
    ["Escenarios", "Escenarios de Participación", ".page-kpi"],
    ["Reportes", "Reportes y Documentos", ".report-kpis > div"],
    ["Datos", "Gestión de Datos", ".page-kpi"],
  ]) {
    await open(page, section);
    await expect(
      page.getByRole("button", { name: section, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: title })).toBeAttached();
    await expect(page.locator(cards)).toHaveCount(4);
    await expect(page.locator('[data-name="Indicador electoral"]')).toHaveCount(
      0,
    );
  }
});

test("Predicciones splits the assistant into a settings panel and a full-width chat", async ({
  page,
}) => {
  await offlineAssistant(page);
  await open(page, "Predicciones");
  const panel = page.locator(".ai-panel");
  await expect(panel.getByLabel("Año objetivo del asistente")).toBeVisible();
  await expect(panel.getByLabel("Proyección del asistente")).toContainText(
    "2027",
  );
  await expect(
    page.locator(".ai-chat").getByRole("button", { name: "Nueva conversación" }),
  ).toBeDisabled();
  await panel
    .getByRole("button", { name: /Ver metodología y límites/ })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Laboratorio de modelos",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
});

test("assistant falls back to a labelled automatic reading without an AI model", async ({
  page,
}) => {
  await offlineAssistant(page);
  await open(page, "Predicciones");
  await expect(page.locator(".ai-connection")).toHaveText(
    "Groq sin configurar",
  );
  await page
    .getByRole("button", { name: "¿Qué tan confiable es la estimación?" })
    .click();
  const reply = page.locator('.ai-message[data-role="assistant"]').last();
  await expect(reply).toContainText("banda empírica");
  await expect(reply).toContainText("Lectura automática · sin modelo de IA");
});

for (const { provider, connection, initialModel, chosenModel } of [
  {
    provider: "groq",
    connection: "Groq configurado",
    initialModel: "llama-3.3-70b-versatile",
    chosenModel: "llama-3.1-8b-instant",
  },
  {
    provider: "gemini",
    connection: "Gemini configurado",
    initialModel: "gemini-2.5-flash",
    chosenModel: "gemini-2.5-pro",
  },
  {
    provider: "ollama",
    connection: "Ollama conectado",
    initialModel: "llama3.2:3b",
    chosenModel: "qwen2.5:7b",
  },
]) {
  test(`assistant sends the conversation and chosen model to ${provider}`, async ({
    page,
  }) => {
    let sent: {
      state_code: string;
      model: string;
      messages: unknown[];
    } | null = null;
    await page.route("**/api/assistant", (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({
          json: {
            provider,
            reachable: true,
            models: [initialModel, chosenModel],
            defaultModel: initialModel,
          },
        });
      sent = route.request().postDataJSON();
      return route.fulfill({
        json: { answer: "Respuesta del modelo de prueba.", model: chosenModel },
      });
    });
    await open(page, "Predicciones");
    await expect(page.locator(".ai-connection")).toHaveText(connection);
    await page
      .getByRole("combobox", { name: "Modelo de IA", exact: true })
      .click();
    await page.getByRole("option", { name: chosenModel, exact: true }).click();
    await page
      .getByLabel("Pregunta para el asistente")
      .fill("¿Cómo evolucionó la abstención?");
    await page.getByRole("button", { name: "Enviar pregunta" }).click();
    await expect(
      page.locator('.ai-message[data-role="assistant"]').last(),
    ).toContainText(`IA · ${chosenModel}`);
    expect(sent).toMatchObject({
      state_code: "17",
      model: chosenModel,
      messages: [{ role: "user", content: "¿Cómo evolucionó la abstención?" }],
    });
  });
}

test("reports preview the chosen state on the shared republic map", async ({
  page,
}) => {
  await open(page, "Reportes");
  await page
    .getByRole("combobox", { name: "Entidad del reporte", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Baja California", exact: true })
    .click();
  await expect(page.locator(".report-state")).toHaveText("Baja California");
  await expect(
    page.getByRole("img", { name: /Mapa de Baja California/ }),
  ).toBeVisible();
  await expect(page.locator(".report-findings li")).toHaveCount(4);
  const pdfDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar reporte", exact: true })
    .click();
  const pdf = await pdfDownload;
  expect(pdf.suggestedFilename()).toBe("atlas-participacion-reporte-02-2027.pdf");
  await expect(page.locator(".report-recent tbody tr")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Nacional", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Municipal", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("radio", { name: "PDF (recomendado)", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("switch", {
      name: "Activar Reporte semanal nacional",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Página siguiente", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".report-state")).toHaveText("Baja California");
  await page.getByRole("radio", { name: "Excel", exact: true }).check();
  const excelDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar reporte", exact: true })
    .click();
  expect((await excelDownload).suggestedFilename()).toBe(
    "atlas-participacion-reporte-02-2027.xlsx",
  );
  await expect(page.locator(".report-recent tbody tr")).toHaveCount(2);
});

test("analysis does not reuse an AI answer for another state or period", async ({
  page,
}) => {
  await page.route("**/api/assistant", (route) =>
    route.fulfill({
      json: {
        answer: "Respuesta exclusiva de Morelos 2018–2024.",
        model: "test-model",
      },
    }),
  );
  await open(page, "Análisis IA");
  await page
    .getByRole("button", { name: "Preguntar a la IA", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Tu pregunta", exact: true })
    .fill("Resume la estimación.");
  await page
    .getByRole("button", { name: "Consultar a la IA", exact: true })
    .click();
  await expect(page.getByRole("status", { name: "Respuesta del asistente de IA" })).toContainText(
    "Respuesta exclusiva de Morelos",
  );
  await expect(page.getByRole("status", { name: "Respuesta del asistente de IA" })).toContainText("IA · test-model");
  await page
    .getByRole("button", { name: "Cerrar lectura", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Periodo del análisis", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Periodo: 2012 – 2024", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Preguntar a la IA", exact: true })
    .click();
  await expect(
    page.getByText("Respuesta exclusiva de Morelos 2018–2024.", {
      exact: true,
    }),
  ).toHaveCount(0);
});

test("map KPI cards follow the selected forecast instead of design placeholders", async ({
  page,
  request,
}) => {
  const response = await request.get(
    "/api/backend/predictions?target_year=2027&limit=100",
  );
  const { items } = await response.json();
  await page.goto("/");
  for (const [code, name] of [
    ["17", "Morelos"],
    ["02", "Baja California"],
  ]) {
    if (code === "02")
      await page
        .getByRole("button", {
          name: "Seleccionar Baja California",
          exact: true,
        })
        .click();
    const forecast = items.find(
      (item: { state_code: string }) => item.state_code === code,
    );
    const cards = page.locator('[data-name="Indicadores clave"]');
    await expect(
      cards.getByRole("article", {
        name: "Abstención estimada 2027",
        exact: true,
      }),
    ).toContainText(`${(forecast.predicted * 100).toFixed(1)}%`);
    await expect(
      cards.getByRole("article", {
        name: "Participación estimada 2027",
        exact: true,
      }),
    ).toContainText(name.toUpperCase());
    await expect(
      cards.getByRole("article", {
        name: "Entidades en riesgo alto",
        exact: true,
      }),
    ).toContainText(
      `${items.filter((item: { risk_level: string }) => item.risk_level === "high").length} de 32`,
    );
    await expect(cards).not.toContainText("Municipios prioritarios");
  }
});

test("data explorer filters, downloads and excludes unverified municipal data", async ({
  page,
}) => {
  await open(page, "Datos");
  await expect(page.locator(".data-header-stats li")).toHaveCount(3);
  const rows = page.locator(".data-table tbody tr");
  await expect(rows).toHaveCount(10);
  await page.getByLabel("Buscar en los datos").fill("baja");
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: /Descargar datos/ }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /CSV/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("atlas-participacion-datos-estatal-2024.csv");
  await page.getByLabel("Buscar en los datos").fill("");
  await expect(page.getByRole("radio", { name: /Municipal/ })).toBeDisabled();
  await expect(
    page.getByText("El nivel municipal requiere homologación oficial.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".data-illustrative")).toHaveCount(0);
  await expect(rows).toHaveCount(10);
});

test("national comparison exports official-history PDFs and Excel", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Reportes", exact: true }).click();
  await page.getByRole("button", { name: "Nacional", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Panorama de las 32 entidades" })).toBeVisible();
  await expect(page.locator(".national-states-table tbody tr")).toHaveCount(32);
  const downloadButton = page.getByRole("button", { name: "Descargar comparativo nacional" });
  await expect(downloadButton).toBeEnabled();
  const pdfPromise = page.waitForEvent("download");
  await downloadButton.click();
  expect((await pdfPromise).suggestedFilename()).toBe("atlas-participacion-reporte-nacional-2027.pdf");
  await page.getByRole("radio", { name: "Excel", exact: true }).check();
  const excelPromise = page.waitForEvent("download");
  await downloadButton.click();
  expect((await excelPromise).suggestedFilename()).toBe("atlas-participacion-reporte-nacional-2027.xlsx");
  await page.getByRole("button", { name: "Volver al reporte estatal" }).click();
  await expect(page.getByRole("heading", { name: "Configura tu reporte" })).toBeVisible();
});

test("notifications summarize loaded data, open their section and stay read", async ({
  page,
}) => {
  await page.goto("/");
  const bell = page.getByRole("button", { name: /^Notificaciones/ });
  await expect(bell).toHaveAttribute("aria-label", /sin leer/);
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notificaciones" });
  await expect(panel.getByText("Estimación 2027 disponible")).toBeVisible();
  await expect(panel.getByText("Datos oficiales cargados")).toBeVisible();
  await panel
    .getByRole("button", { name: /Estimación 2027 disponible/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Predicciones", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await bell.click();
  await page.getByRole("button", { name: "Marcar como leídas" }).click();
  await expect(bell).toHaveAttribute("aria-label", "Notificaciones");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: /^Notificaciones/ }),
  ).toHaveAttribute("aria-label", "Notificaciones");
});

test("the header process drives the map trend, report history and data year", async ({
  page,
}) => {
  await page.goto("/");
  const process = page.getByRole("combobox", {
    name: "Proceso electoral de referencia",
  });
  await process.click();
  await page.getByRole("option", { name: /2015/ }).click();
  const trend = page.locator(".lower-trends");
  await expect(
    trend.getByRole("combobox", { name: "Elecciones de la tendencia" }),
  ).toHaveText("Intermedias");
  await expect(trend.locator("header p")).toContainText("Proceso 2015");
  // A chosen process shows that election on the map, not the single 2027 estimate.
  await expect(
    page.getByRole("button", { name: "Histórico", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".territory-gauge")).toContainText(
    "Abstención observada · 2015",
  );
  await page.getByRole("button", { name: "Reportes", exact: true }).click();
  await expect(page.locator(".report-process")).toHaveText(
    "Proceso Electoral 2015",
  );
  const years = page.locator(".report-charts .chart text");
  // The axis label plus the process marker label.
  await expect(years.filter({ hasText: /^2015$/ })).toHaveCount(2);
  await expect(years.filter({ hasText: /^2018$/ })).toHaveCount(0);
  // Colima is framed on its mainland, not stretched out to the Revillagigedo islands.
  await page
    .getByRole("combobox", { name: "Entidad del reporte", exact: true })
    .click();
  await page.getByRole("option", { name: /Colima/i }).click();
  const viewBox = await page.locator(".report-map svg").getAttribute("viewBox");
  expect(Number(viewBox?.split(" ")[2])).toBeLessThan(3);
  await page.getByRole("button", { name: "Datos", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Año o proceso", exact: true }),
  ).toContainText("2015");
});

test("predictions show historical errors, NS and explicit external limits", async ({ page }) => {
  await open(page, "Predicciones");
  const panel = page.getByRole("region", {
    name: "¿Qué tan validada está esta predicción?",
  });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("MAE 2021");
  await expect(panel).toContainText("MAE 2024");
  await expect(panel).toContainText("14.37");
  await expect(panel).toContainText("Validación externa pendiente");
  await expect(panel).toContainText("Sensibilidad a NS");
  await expect(panel).toContainText("no es una banda predictiva");
});

test("another forecast of the same model cannot inherit the frozen audit", async ({ page }) => {
  await page.route("**/api/backend/predictions?**", async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ response, json: { ...data, forecast: { ...data.forecast, id: "different-forecast-run" } } });
  });
  await open(page, "Predicciones");
  const panel = page.getByRole("region", { name: "¿Qué tan validada está esta predicción?" });
  await expect(panel).toContainText("no coinciden con la auditoría congelada");
  await expect(panel.locator(".validation-metric")).toHaveCount(0);
  await expect(panel).toContainText("Validación externa pendiente");
});
