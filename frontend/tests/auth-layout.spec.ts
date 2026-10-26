import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("auth pages fit mobile and desktop and respect reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, title] of [
      ["/login", "Bienvenido de nuevo"],
      ["/registro", "Crea tu cuenta"],
      ["/recuperar", "Recupera tu contraseña"],
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const submit = page.locator(".auth-primary");
      await submit.hover();
      await expect(submit).toHaveCSS("transform", "none");
      for (const img of await page.locator(".auth-card img").all()) {
        expect(
          await img.evaluate(
            (node: HTMLImageElement) => node.complete && node.naturalWidth > 0,
          ),
        ).toBe(true);
      }
      await page.screenshot({
        path: `test-results/auth-${path.slice(1)}-${width}.png`,
        fullPage: true,
      });
    }
  }
});
