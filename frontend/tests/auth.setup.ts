import { test as setup, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

setup(
  "sign in through the real application using the local Auth fixture",
  async ({ page }) => {
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
    await mkdir(".playwright/auth", { recursive: true });
    await page.context().storageState({ path: ".playwright/auth/user.json" });
  },
);
