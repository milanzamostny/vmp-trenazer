import { test, expect, type Page } from "@playwright/test";

const TABLET_MIN = 740;

async function noHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw, "stránka nesmí jít posouvat do strany").toBeLessThanOrEqual(cw);
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => {
    throw e;
  });
});

test("přehled se načte se statistikou všech okruhů", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Zkouška M" })).toBeVisible();
  await expect(page.locator("table.stats tbody tr")).toHaveCount(6);
  await expect(page.locator(".kpi").first()).toContainText("0/407");
  await noHorizontalScroll(page);
});

test("navigace odpovídá šířce (horní lišta na iPadu/PC, spodní na mobilu)", async ({ page }) => {
  await page.goto("./");
  const width = page.viewportSize()!.width;
  if (width >= TABLET_MIN) {
    await expect(page.locator("nav.tabs")).toBeVisible();
    await expect(page.locator("nav.bottom-tabs")).toBeHidden();
  } else {
    await expect(page.locator("nav.bottom-tabs")).toBeVisible();
    await expect(page.locator("nav.tabs")).toBeHidden();
  }
  const nav = page.locator(width >= TABLET_MIN ? "nav.tabs" : "nav.bottom-tabs");
  await nav.getByRole("link", { name: /Prohlížení/ }).click();
  await expect(page.getByRole("heading", { name: "Prohlížení sady" })).toBeVisible();
});

test("procvičování: odpověď ukáže výsledek a vysvětlení, postup přežije reload", async ({ page }) => {
  await page.goto("./#/procvicovani?set=PP3%202015&order=seq&start=1");
  await expect(page.locator(".counter")).toHaveText("1 / 56");
  const img = page.locator(".q-img");
  await expect(img).toBeVisible();
  expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);

  const opts = page.locator(".opt");
  await expect(opts).toHaveCount(3);
  for (const o of await opts.all()) expect((await o.boundingBox())!.height, "dotyková plocha ≥ 44 px").toBeGreaterThanOrEqual(44);
  await opts.first().click();
  await expect(page.locator(".verdict")).toBeVisible();
  await expect(page.locator(".opt.correct")).toHaveCount(1);
  await expect(page.locator(".explain")).toContainText("Vysvětlení");
  await noHorizontalScroll(page);

  await page.getByRole("button", { name: /Další/ }).click();
  await expect(page.locator(".counter")).toHaveText("2 / 56");

  await page.goto("./");
  await page.reload();
  await expect(page.locator(".kpi").first()).toContainText("1/407");
});

test("klávesnice na PC: A/B/C, Enter, šipky", async ({ page, isMobile }) => {
  test.skip(isMobile, "jen pro PC");
  await page.goto("./#/procvicovani?set=PP4%202015&order=seq&start=1");
  await expect(page.locator(".counter")).toHaveText("1 / 125"); // otázky se načítají asynchronně
  await page.keyboard.press("b");
  await expect(page.locator(".verdict")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".counter")).toHaveText("2 / 125");
  await page.keyboard.press("3");
  await expect(page.locator(".verdict")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".counter")).toHaveText("1 / 125");
  await expect(page.locator(".opt.correct")).toHaveCount(1); // zpět = jen prohlížení
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".counter")).toHaveText("2 / 125");
});

test("test nanečisto: 35 otázek, časomíra, bez nápovědy, rozbor po odevzdání", async ({ page }) => {
  await page.goto("./#/test?start=1");
  await expect(page.locator(".dot")).toHaveCount(35);
  await expect(page.locator(".timer")).toHaveText(/⏱ (30:00|29:5\d)/);
  await page.locator(".opt").first().click();
  await expect(page.locator(".opt.selected")).toHaveCount(1);
  await expect(page.locator(".verdict, .explain, .opt.correct")).toHaveCount(0);
  await expect(page.locator(".dot.done")).toHaveCount(1);

  page.once("dialog", (d) => d.accept());
  await page.locator(".session-head").getByRole("button", { name: "Odevzdat" }).click();
  await expect(page.locator(".big-score")).toHaveText(/^\d+ \/ 35$/);
  await expect(page.locator(".result h2")).toHaveText(/Neprospěl/);
  expect(await page.locator(".review-item").count()).toBeGreaterThanOrEqual(34);
  await expect(page.locator(".review-item .explain").first()).toBeVisible();
});

test("prohlížení: fulltext a hledání podle čísla", async ({ page }) => {
  await page.goto("./#/prohlizeni");
  const input = page.getByRole("searchbox", { name: "Hledat" });
  await input.fill("tisnove cislo");
  await expect(page.locator(".browse-item")).not.toHaveCount(0);
  await input.fill("411");
  await expect(page.locator(".browse-item")).toHaveCount(1);
  await expect(page.locator(".browse-item .answer-ok")).toContainText("112");
});

test("chyby: špatná odpověď se objeví v přihrádce 1", async ({ page }) => {
  await page.goto("./#/procvicovani?set=ZP%202015&order=seq&start=1");
  // vyber špatnou odpověď
  const wrong = page.locator(".opt").filter({ hasNotText: "postup sloužící pro dočasnou náhradu" }).first();
  await wrong.click();
  await expect(page.locator(".verdict")).toHaveText(/Špatně/);
  await page.goto("./#/chyby");
  await expect(page.locator(".box.b1 b")).toHaveText("1");
  await page.getByRole("link", { name: /Opakovat \(1\)/ }).click();
  await expect(page.locator(".q-num")).toHaveText("č. 380");
});

test("export a import postupu", async ({ page }) => {
  await page.goto("./#/procvicovani?set=TZ%202015&order=seq&start=1");
  await page.locator(".opt").first().click();
  await page.goto("./");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportovat postup" }).click();
  const file = await (await dl).path();
  page.once("dialog", (d) => d.accept()); // smazat postup
  await page.getByRole("button", { name: "Smazat postup" }).click();
  await expect(page.locator(".kpi").first()).toContainText("0/407");
  page.on("dialog", (d) => d.accept()); // sloučit + oznámení
  await page.locator('input[type="file"]').setInputFiles(file!);
  await expect(page.locator(".kpi").first()).toContainText("1/407");
});

test("PWA: manifest, ikony a výzva k instalaci", async ({ page, request, browserName, isMobile }) => {
  await page.goto("./");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(manifestHref!)).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.lang).toBe("cs");
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(touch!)).ok()).toBe(true);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  const banner = page.locator("aside.install");
  if (browserName === "webkit" && isMobile) await expect(banner).toContainText("Přidat na plochu");
  else await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Teď ne" }).click();
  await page.reload();
  await expect(banner).toHaveCount(0);
});

test("offline: po první návštěvě funguje bez sítě", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "service worker v Playwright ověřujeme v Chromiu");
  await page.goto("./");
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    // počkej, až se dokončí precache (aktivní SW)
    while (reg.active?.state !== "activated") await new Promise((r) => setTimeout(r, 100));
  });
  await page.reload(); // stránku převezme service worker
  await context.setOffline(true);
  await page.goto("./#/procvicovani?set=PP3%202015&order=seq&start=1");
  await expect(page.locator(".q-img")).toBeVisible();
  expect(await page.locator(".q-img").evaluate((i: HTMLImageElement) => i.naturalWidth > 0)).toBe(true);
  await context.setOffline(false);
});
