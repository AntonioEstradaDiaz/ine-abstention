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

test("redesigned sections share the map header and four live metric cards", async ({
  page,
}) => {
  await offlineAssistant(page);
  for (const [section, title] of [
    ["Predicciones", "Predicciones de Abstención 2027"],
    ["Escenarios", "Escenarios de Participación"],
    ["Reportes", "Reportes y Exportaciones"],
    ["Datos", "Datos y Fuentes Oficiales"],
  ]) {
    await open(page, section);
    await expect(
      page.getByRole("button", { name: section, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: title })).toBeAttached();
    await expect(page.locator(".page-kpi")).toHaveCount(4);
    await expect(page.locator('[data-name="Indicador electoral"]')).toHaveCount(
      0,
    );
  }
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

test("reports preview the selected table and download it filtered", async ({
  page,
}) => {
  await open(page, "Reportes");
  await page.getByLabel("Buscar territorio").fill("baja");
  const rows = page.locator(".section-table tbody tr");
  await expect(rows).toHaveCount(2);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar CSV", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "pulso-estimacion-2027.csv",
  );
  await page.getByRole("radio", { name: /Distribución del riesgo/ }).click();
  await expect(rows).toHaveCount(3);
});

test("data section lists official sources and the coverage heatmap", async ({
  page,
}) => {
  await open(page, "Datos");
  await expect(page.locator(".data-source-list li")).not.toHaveCount(0);
  await expect(
    page.getByRole("img", { name: /Mapa de calor de abstención observada/ }),
  ).toBeVisible();
});
