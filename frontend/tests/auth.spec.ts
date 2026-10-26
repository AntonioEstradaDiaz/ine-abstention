import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ storageState: { cookies: [], origins: [] } });

test("anonymous requests cannot access the dashboard or either private API", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  for (const path of ["/api/backend/predictions", "/api/assistant"]) {
    expect((await request.get(path)).status()).toBe(401);
  }
});

test("invalid credentials do not create a session", async ({ page }) => {
  await page.goto("/login");
  await page
    .getByRole("textbox", { name: "Correo electrónico" })
    .fill("browser-test@example.invalid");
  await page.locator('input[name="password"]').fill("wrong-password");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Acceso al dashboard" })
      .getByRole("alert"),
  ).toContainText("No pudimos iniciar sesión");
  expect((await page.request.get("/api/backend/predictions")).status()).toBe(
    401,
  );
});

test("login and logout grant and revoke access with server-validated cookies", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByRole("textbox", { name: "Correo electrónico" })
    .fill("browser-test@example.invalid");
  await page.locator('input[name="password"]').fill("Browser-test-only-123!");
  await page
    .getByRole("button", { name: "Iniciar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mapa de riesgo", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/backend/predictions")).status()).toBe(
    200,
  );
  await page.locator('form[action="/api/auth/logout"] button').click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/backend/predictions")).status()).toBe(
    401,
  );
  expect((await page.request.get("/api/assistant")).status()).toBe(401);
});

test("a forged session cookie cannot authorize access", async ({ context }) => {
  const state = JSON.parse(
    await readFile(".playwright/auth/user.json", "utf8"),
  );
  const cookie = state.cookies.find(
    (c: { name: string }) =>
      c.name.startsWith("sb-") && c.name.endsWith("-auth-token"),
  );
  expect(cookie).toBeTruthy();
  const session = JSON.parse(
    Buffer.from(cookie.value.slice("base64-".length), "base64url").toString(),
  );
  session.access_token = session.access_token.slice(0, -4) + "fake";
  cookie.value =
    "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  await context.addCookies([cookie]);
  expect((await context.request.get("/api/backend/predictions")).status()).toBe(
    401,
  );
});
