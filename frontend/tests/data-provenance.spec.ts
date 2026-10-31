import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Punto 4: provenance card, separated dates and "Recargar datos". Runs against the demo copy
// locally and against the API in CI: assertions hold in both modes.
const openData = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Datos", exact: true }).click();
  const card = page.locator(".data-provenance");
  await expect(card.locator("tbody tr")).toHaveCount(7);
  return card;
};

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("the provenance card lists six elections and the INEGI cartography", async ({
  page,
}) => {
  const card = await openData(page);
  await expect(
    card.getByRole("heading", { name: "Versión de los datos" }),
  ).toBeVisible();
  await expect(card.locator(".data-provenance-origin")).toHaveText(
    /Copia fija incluida en la demo · empaquetada el|Datos servidos por la API del proyecto/,
  );
  const rows = card.locator("tbody tr");
  await expect(rows.locator("th")).toHaveText([
    "2009",
    "2012",
    "2015",
    "2018",
    "2021",
    "2024",
    "Cartografía",
  ]);
  for (let i = 0; i < 6; i++) {
    const cells = rows.nth(i).locator("td");
    await expect(cells.nth(0)).toContainText("INE");
    await expect(cells.nth(1)).toHaveText(/^\d{2} [a-z]{3} \d{4}$/);
    await expect(cells.nth(2)).toHaveText(/^\d{2} [a-z]{3} \d{4}$/);
    await expect(cells.nth(3)).toHaveText("Validado");
    await expect(cells.nth(4)).toHaveText("ccpc-v1");
    await expect(cells.nth(5).locator("code")).toHaveText(/^[0-9a-f]{12}…$/);
  }
  const inegi = rows.nth(6).locator("td");
  await expect(inegi.nth(0)).toContainText("INEGI");
  await expect(inegi.nth(3)).toHaveText("No aplica");
  await expect(
    card.getByRole("link", { name: /Página oficial del INE/ }).first(),
  ).toHaveAttribute("target", "_blank");
  await expect(card.locator(".section-card-note")).toContainText(
    "no es la fecha oficial de publicación",
  );
});

test("copying a hash and downloading the manifest", async ({ page }) => {
  const card = await openData(page);
  await card
    .getByRole("button", { name: "Copiar huella SHA-256 de 2024" })
    .click();
  await expect(card.locator(".data-provenance-copied")).toHaveText(
    "Huella de 2024 copiada.",
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^[0-9a-f]{64}$/,
  );

  const pending = page.waitForEvent("download");
  await card.getByRole("button", { name: "Descargar manifiesto" }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toMatch(
    /^atlas-participacion-procedencia-ccpc-v1-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const manifest = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(manifest.proyecto).toBe("Atlas De La Participación");
  expect(manifest.fuentes).toHaveLength(6);
  for (const f of manifest.fuentes) {
    expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(f.validacion).toBe("validated");
  }
  expect(manifest.cartografia.sha256).toMatch(/^[0-9a-f]{64}$/);
});

test("data and prediction dates are named apart and the reload action is honest", async ({
  page,
}) => {
  await openData(page);
  const main = page.locator("main");
  await expect(main).not.toContainText("Última actualización");
  await expect(main).not.toContainText("Datos verificados");
  await expect(page.locator(".data-header-stats li").first()).toContainText(
    "Datos consultados",
  );
  await expect(page.locator(".page-kpi").last()).toContainText(
    /Predicción generada.*(Copia fija de la demo|API del proyecto)/,
  );
  await expect(page.locator(".data-variable-facts dt")).toContainText([
    "Datos consultados",
    "Predicción generada",
  ]);
  await expect(
    page.getByRole("button", { name: "Recargar datos" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Actualizar fuentes" }),
  ).toHaveCount(0);
});

test("on a phone the table scrolls inside its region without widening the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("combobox", { name: "Sección de la aplicación", exact: true })
    .click();
  await page.getByRole("option", { name: "Datos", exact: true }).click();
  await expect(page.locator(".data-provenance tbody tr")).toHaveCount(7);
  await expect(
    page.getByRole("region", { name: "Tabla de procedencia de los datos" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
