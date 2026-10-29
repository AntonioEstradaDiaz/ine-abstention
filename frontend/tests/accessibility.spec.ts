import { test, expect } from "@playwright/test";

test.describe("Documentación pública", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const [url, title] of [
    ["/privacidad", "Aviso de privacidad (borrador)"],
    ["/soporte", "Ayuda y soporte"],
    ["/terminos", "Términos de uso de la demostración"],
  ]) {
    test(`ruta ${url}: encabezado, teclado y responsive`, async ({ page }) => {
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url);
        await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
        await expect(page.locator("main")).toHaveCount(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.reload();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Ir al contenido" })).toBeFocused();
    });
  }
  test("soporte dirige a recuperación", async ({ page }) => {
    await page.goto("/soporte");
    await expect(page.getByRole("link", { name: "recuperar contraseña" })).toHaveAttribute("href", "/recuperar");
  });
});

test("dashboard: navegación por teclado y enlaces de información", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Ir al contenido" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Secciones principales" })).toBeVisible();
  await page.getByRole("button", { name: "Reportes", exact: true }).click();
  await expect(page.getByRole("status", { name: "Sección activa" })).toContainText("Reportes");
  await expect(page.getByRole("navigation", { name: "Información del proyecto" })
    .getByRole("link", { name: "Aviso de privacidad" })).toHaveAttribute("href", "/privacidad");
});
