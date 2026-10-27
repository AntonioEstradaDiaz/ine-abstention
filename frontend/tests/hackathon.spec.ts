import { test, expect } from "@playwright/test";

test("saved scenario survives reload and restores its original calculation", async ({
  page,
  request,
}) => {
  await page.route("**/api/assistant", (route) =>
    route.fulfill({
      json: { reachable: false, models: [], defaultModel: null },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Escenarios", exact: true }).click();
  await page
    .getByLabel("Cambio hipotético en participación", { exact: true })
    .fill("7.3");
  const responsePromise = page.waitForResponse(
    (r) =>
      r.url().includes("/api/backend/simulations") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Calcular escenario", exact: true })
    .click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const saved = await response.json();
  expect(saved.result.assumptions.persisted).toBe(true);
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Escenarios", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "7.3 pp" }).first();
  await row
    .getByRole("button", { name: "Recuperar escenario", exact: true })
    .click();
  await expect(
    page.getByLabel("Cambio hipotético en participación", { exact: true }),
  ).toHaveValue("7.3");
  await expect(page.locator(".simulation-id code")).toHaveText(saved.id);
  const history = await request.get("/api/backend/simulations?state_code=17");
  expect(
    (await history.json()).items.some((r: { id: string }) => r.id === saved.id),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/hackathon-scenarios-mobile.png",
    fullPage: true,
  });
});
