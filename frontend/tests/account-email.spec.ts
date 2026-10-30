import { test, expect } from "@playwright/test";

/** Email account flows against the Auth fixture: resend, two-step links and expired links. */
test.use({ storageState: { cookies: [], origins: [] } });

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const notice = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "Acceso al dashboard" }).locator(".auth-notice");

test("an unconfirmed account can ask for a new confirmation link, then must wait", async ({ page }) => {
  await page.goto("/login");
  await page
    .getByRole("textbox", { name: "Correo electrónico" })
    .fill("browser-unconfirmed@example.invalid");
  await page.locator('input[name="password"]').fill("Browser-test-only-123!");
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(notice(page)).toContainText("Confirma tu correo antes de iniciar sesión");

  // Count resend requests: a click while waiting must not send a second one.
  let resends = 0;
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/resend")) resends++;
  });
  const resend = page.getByRole("button", { name: "Reenviar confirmación" });
  await resend.click();
  await expect(notice(page)).toContainText("Si la cuenta existe y falta confirmarla");
  const waiting = page.locator(".auth-resend");
  await expect(waiting).toHaveText(/Reenviar en \d+ s/);
  await expect(waiting).toHaveAttribute("aria-disabled", "true");
  await waiting.click({ force: true });
  await page.waitForTimeout(500);
  expect(resends).toBe(1);
  await expect(notice(page)).toContainText("Si la cuenta existe y falta confirmarla");
  await expect(page).toHaveURL(/\/login$/);
});

test("the resend button only stays for its three cases", async ({ page }) => {
  await page.goto("/login?error=confirmation");
  await expect(page.getByRole("button", { name: "Reenviar confirmación" })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Correo electrónico" })
    .fill("browser-test@example.invalid");
  await page.locator('input[name="password"]').fill("wrong-password");
  await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
  await expect(notice(page)).toContainText("No pudimos iniciar sesión");
  await expect(page.locator(".auth-resend")).toHaveCount(0);
});

test("registering offers to resend the confirmation without revealing anything", async ({ page }) => {
  await page.goto("/registro");
  await page.locator('input[name="first_name"]').fill("Prueba");
  await page.locator('input[name="last_name"]').fill("Registro");
  await page
    .getByRole("textbox", { name: "Correo electrónico" })
    .fill(`registro-${unique()}@example.invalid`);
  await page.locator('input[name="password"]').fill("Registro-prueba-123!");
  await page.locator('input[name="confirm"]').fill("Registro-prueba-123!");
  await page.locator('input[name="privacy"]').check();
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(notice(page)).toContainText("Revisa también la carpeta de spam");
  await expect(page.getByRole("button", { name: "Reenviar confirmación" })).toBeVisible();
});

test("opening an email link does not spend it; the button confirms and signs in", async ({ page }) => {
  const link = `/auth/confirm?token_hash=ok-confirm-${unique()}&type=email`;
  // A mail scanner opening the link first must not use up the one-time token.
  await page.goto(link);
  await expect(page).toHaveURL(/\/confirmar\?/);
  await page.goto(link);
  await expect(page).toHaveURL(/\/confirmar\?/);
  await expect(page.getByRole("heading", { name: "Confirma tu cuenta de Atlas" })).toBeVisible();
  await page.getByRole("button", { name: "Confirmar mi cuenta" }).click();
  await expect(page.getByRole("button", { name: "Mapa de riesgo", exact: true })).toBeVisible();
});

test("a spent or invalid confirmation link returns to login and offers a resend", async ({ page }) => {
  await page.goto("/confirmar?token_hash=no-valido&type=email");
  await page.getByRole("button", { name: "Confirmar mi cuenta" }).click();
  await expect(page).toHaveURL(/\/login\?error=confirmation$/);
  await expect(notice(page)).toContainText("no es válido o ya expiró");
  await expect(page.getByRole("button", { name: "Reenviar confirmación" })).toBeVisible();
});

test("an invalid recovery link returns to recovery with a clear message", async ({ page }) => {
  await page.goto("/confirmar?token_hash=no-valido&type=recovery");
  await expect(page.getByRole("heading", { name: "Restablece tu contraseña" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/recuperar\?error=expired$/);
  await expect(notice(page)).toContainText("venció o ya se usó");
});

test("unknown link types and cross-site posts are rejected", async ({ request }) => {
  const unknown = await request.get("/auth/confirm?token_hash=x&type=magiclink", { maxRedirects: 0 });
  expect(unknown.status()).toBe(307);
  expect(unknown.headers().location).toMatch(/\/login\?error=confirmation$/);
  const crossSite = await request.post("/auth/confirm", {
    headers: { Origin: "https://otro-sitio.example" },
    form: { token_hash: `ok-confirm-${unique()}`, type: "email" },
    maxRedirects: 0,
  });
  expect(crossSite.status()).toBe(403);
});

test("a valid recovery link leads to a new password and back to login", async ({ page }) => {
  await page.goto(`/auth/confirm?token_hash=ok-recovery-${unique()}&type=recovery`);
  await expect(page).toHaveURL(/\/confirmar\?/);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.locator('input[name="password"]').fill("Nueva-clave-segura-123!");
  await page.locator('input[name="confirm"]').fill("Nueva-clave-segura-123!");
  await page.getByRole("button", { name: "Guardar contraseña", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?updated=1$/);
  await expect(notice(page)).toContainText("Contraseña actualizada");
});
