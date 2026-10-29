import { test, expect } from "@playwright/test";

/** Two identities exercising private scenario histories. Production Supabase RLS still requires verification. */
test("two authenticated accounts cannot access each other's scenarios", async ({ browser, page }) => {
  await page.goto("/");
  const name = `Isolated scenario ${Date.now()}`;
  const created = await page.request.post("/api/backend/simulations", {
    data: { name, state_codes: ["17"], participation_change_pp: 4, target_year: 2027 },
  });
  expect(created.status()).toBe(201);
  const first = await page.request.get("/api/backend/simulations?state_code=17");
  expect((await first.json()).items.some((row: { name: string }) => row.name === name)).toBe(true);

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const second = await context.newPage();
    await second.goto("/login");
    await second.getByRole("textbox", { name: "Correo electrónico" }).fill("browser-second@example.invalid");
    await second.locator('input[name="password"]').fill("Browser-test-only-123!");
    await second.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await expect(second.getByRole("button", { name: "Mapa de riesgo", exact: true })).toBeVisible();
    const secondHistory = await second.request.get("/api/backend/simulations?state_code=17");
    expect(secondHistory.status()).toBe(200);
    expect((await secondHistory.json()).items.some((row: { name: string }) => row.name === name)).toBe(false);

    const createdBySecond = await second.request.post("/api/backend/simulations", {
      data: { name: "Second account only", state_codes: ["17"], participation_change_pp: 2, target_year: 2027 },
    });
    expect(createdBySecond.status()).toBe(201);
    const secondId = (await createdBySecond.json()).id;
    const firstAgain = await page.request.get("/api/backend/simulations?state_code=17");
    expect((await firstAgain.json()).items.some((row: { id: string }) => row.id === secondId)).toBe(false);
  } finally {
    await context.close();
  }
});
