import { test, expect } from "@playwright/test";
import snapshot from "../src/lib/preview-data.json";

test("territory gauge uses observed counts and refreshes without a reload", async ({
  page,
}) => {
  await page.clock.install();
  let voters = 40,
    nonvoters = 60,
    missing = false;
  await page.route("**/api/backend/statistics/territories?**", (route) => {
    const year = Number(
      new URL(route.request().url()).searchParams.get("year"),
    );
    const items = missing
      ? []
      : snapshot.history
          .filter((r) => r.year === year)
          .map((r) => ({
            ...r,
            voter_count: voters,
            nonvoter_count: nonvoters,
            abstention_rate: 0.99,
          }));
    return route.fulfill({ json: { total: items.length, items } });
  });
  await page.goto("/");
  const gauge = page.locator(".territory-gauge");
  await expect(gauge).toContainText("60.0%");
  await expect(gauge).toContainText("Abstención observada · 2024");
  await expect(gauge).not.toContainText("2027");
  voters = 80;
  nonvoters = 20;
  await page.clock.fastForward(61_000);
  await expect(gauge).toContainText("20.0%");
  await expect(gauge.locator(".territory-gauge-value")).toHaveAttribute(
    "stroke-dasharray",
    "20 100",
  );
  voters = 100;
  nonvoters = 0;
  await page.clock.fastForward(61_000);
  await expect(gauge).toContainText("0.0%");
  missing = true;
  await page.clock.fastForward(61_000);
  await expect(gauge).toContainText("Sin datos");
  await expect(gauge.locator(".territory-gauge-value")).toHaveCSS(
    "opacity",
    "0",
  );
});


test("observed gauge remains available without predictions", async ({ page }) => {
  await page.route("**/api/backend/predictions?**", route => route.fulfill({ status: 503, json: { detail: "No forecast available" } }));
  await page.route("**/api/backend/statistics/territories?**", route => route.fulfill({ json: { total: 1, items: [{ ...snapshot.history.find(r => r.state_code === "17" && r.year === 2024)!, voter_count: 70, nonvoter_count: 30 }] } }));
  await page.goto("/");
  await expect(page.locator(".territory-metrics h2")).toHaveText("Morelos");
  await expect(page.locator(".territory-gauge")).toContainText("30.0%");
});
