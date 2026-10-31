import { test, expect } from "@playwright/test";

test("assistant calculates a selected horizon and clears the previous conversation", async ({
  page,
  request,
}) => {
  await page.route("**/api/assistant", (route) =>
    route.fulfill({
      json: {
        provider: "groq",
        reachable: false,
        models: [],
        defaultModel: null,
      },
    }),
  );
  const response = await request.get(
    "/api/backend/participation/history?territory_type=state&state_code=17&limit=100",
  );
  const data = await response.json();
  const row = data.items.find((r: { year: number }) => r.year === 2024);
  await page.goto("/");
  await page.getByRole("button", { name: "Predicciones", exact: true }).click();
  const assistant = page.locator(".ai-assistant");
  const chat = page.locator(".ai-chat");
  await expect(assistant.getByLabel("Proyección del asistente")).toContainText(
    "2027",
  );
  await assistant.getByLabel("Año objetivo del asistente").fill("2028");
  await assistant
    .getByLabel("Tipo de elección del asistente")
    .click();
  await page.getByRole("option", { name: "Presidencial", exact: true }).click();
  await assistant
    .getByRole("button", { name: "Calcular proyección", exact: true })
    .click();
  const result = assistant.getByLabel("Proyección del asistente");
  await expect(result).toContainText("Proyección de referencia · 2028");
  await expect(result).toContainText(
    `${((100 * row.nonvoter_count) / (row.voter_count + row.nonvoter_count)).toFixed(1)}%`,
  );
  await chat
    .getByRole("button", {
      name: "¿Cuál es la proyección del año seleccionado?",
      exact: true,
    })
    .click();
  await expect(
    chat.locator('.ai-message[data-role="assistant"]').last(),
  ).toContainText("2028");
  await assistant.getByLabel("Año objetivo del asistente").fill("2029");
  await assistant
    .getByRole("button", { name: "Calcular proyección", exact: true })
    .click();
  await expect(chat.locator('.ai-message[data-role="user"]')).toHaveCount(
    0,
  );
  await expect(result).toContainText("2029");
  await expect(result).toContainText("Rango de abstención:");
  await expect(result).not.toContainText("no hay banda");
  await assistant.getByLabel("Año objetivo del asistente").fill("2030");
  await assistant.getByRole("button", {name: "Calcular proyección", exact: true}).click();
  await expect(result).toContainText("2029");
  await expect(assistant.getByLabel("Año objetivo del asistente")).toHaveAttribute("max", "2029");
});

test("assistant rejects malformed horizons before contacting an AI provider", async ({
  request,
}) => {
  for (const payload of [
    { target_year: 2020 },
    { target_year: 2030 },
    { target_year: 2028.5 },
    { target_year: 2028, election_type: "invalid" },
  ]) {
    const response = await request.post("/api/assistant", {
      data: {
        state_code: "17",
        messages: [{ role: "user", content: "Predice" }],
        ...payload,
      },
    });
    expect(response.status()).toBe(400);
  }
});
