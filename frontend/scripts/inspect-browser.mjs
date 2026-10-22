import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto("http://127.0.0.1:3000/");
await page.locator("tbody tr").first().waitFor();
await page.locator('[data-map-ready="true"]').waitFor({ timeout: 60_000 });
await page.screenshot({ path: "test-results/inspection.png", fullPage: true });
console.log(
  JSON.stringify(
    { errors, mapStatus: await page.locator(".map-status").allTextContents() },
    null,
    2,
  ),
);
await browser.close();
