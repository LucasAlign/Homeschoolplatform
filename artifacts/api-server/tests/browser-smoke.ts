// Run after `pnpm test`, which builds the real app with an isolated database adapter.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { chromium, expect } from "@playwright/test";

process.env.NODE_ENV = "test";
process.env.SYNTHETIC_DATA_ONLY = "true";
process.env.DATABASE_URL =
  "postgresql://synthetic:synthetic@127.0.0.1:5432/homeschool_synthetic";
process.env.LOG_LEVEL = "silent";
const { app, fixture } = await import(
  pathToFileURL(resolve(".test-build/app.mjs")).href
);
const migrationDir = resolve("../../lib/db/drizzle");
for (const name of (await readdir(migrationDir))
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await fixture.exec(await readFile(resolve(migrationDir, name), "utf8"));
const api = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => api.once("listening", r));
const apiUrl = `http://127.0.0.1:${api.address().port}`;
const { createServer } = await import(
  pathToFileURL(
    createRequire(resolve("../homeschool/package.json")).resolve("vite"),
  ).href
);
const vite = await createServer({
  configFile: resolve("../homeschool/vite.config.ts"),
  server: { port: 0, host: "127.0.0.1", proxy: { "/api": apiUrl } },
});
let browser;
try {
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  for (const firstName of ["Fictional Ada", "Fictional Ben"]) {
    const response = await fetch(apiUrl + "/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName,
        lastName: "Fixture",
        age: 8,
        gradeLevel: "3",
        learningStyle: "mixed",
      }),
    });
    assert.equal(response.status, 201);
  }
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "msedge",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.route("**/*", (route) =>
    /^http:\/\/127\.0\.0\.1:/.test(route.request().url()) ||
    route.request().url().startsWith("data:")
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/work");
  await page.screenshot({
    path: ".test-build/work-initial.png",
    fullPage: true,
  });
  console.log("Initial browser page:", await page.title());
  page.on("console", (message) => {
    if (message.type() === "error") console.error(message.text());
  });
  await page
    .getByLabel("Child", { exact: true })
    .selectOption({ label: "Fictional Ada" });
  await page.getByText("Plan an assignment", { exact: true }).click();
  await page
    .getByLabel("Assignment title", { exact: true })
    .fill("Garden seed arithmetic");
  await page.getByLabel("Subject", { exact: true }).fill("Math");
  await page
    .getByLabel("Curriculum or book", { exact: true })
    .fill("Sample workbook");
  await page.getByLabel("School year", { exact: true }).fill("2026-27");
  await page.getByLabel("Due date", { exact: true }).fill("2026-01-01");
  await page
    .getByLabel("Instructions / pages / activity", { exact: true })
    .fill("Add two seeds and three seeds. Show your work.");
  await page
    .getByLabel("Rubric or answer key for parent review", { exact: true })
    .fill("Five seeds, with a drawing or explanation.");
  await page
    .getByRole("button", { name: "Save assignment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Garden seed arithmetic" }),
  ).toBeVisible();
  await page.getByText("Plan an assignment", { exact: true }).click();
  await page
    .getByLabel("Notes", { exact: true })
    .fill("Two plus three equals five.");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.getByRole("button", { name: "Submit for parent review" }).click();
  await expect(
    page.getByRole("heading", { name: "Garden seed arithmetic" }),
  ).toHaveCount(0);
  await page.getByLabel("Show", { exact: true }).selectOption("review");
  await expect(page.getByAltText("synthetic.png")).toBeVisible();
  assert.equal(
    await page
      .getByAltText("synthetic.png")
      .evaluate((image: HTMLImageElement) => image.naturalWidth > 0),
    true,
  );
  await page.getByText("Parent review / override", { exact: true }).click();
  await page
    .getByLabel("Feedback", { exact: true })
    .fill("Correct explanation.");
  await page.getByLabel("Score (optional, 0–100)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Save parent review" }).click();
  await expect(
    page.getByRole("heading", { name: "Garden seed arithmetic" }),
  ).toHaveCount(0);
  await page.getByLabel("Show", { exact: true }).selectOption("all");
  await expect(
    page.getByText("Parent: approved (100/100) — Correct explanation.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Portfolio school year", { exact: true })
    .selectOption("2026-27");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download year portfolio" }).click();
  const download = await downloadPromise;
  const portfolio = JSON.parse(
    await readFile((await download.path())!, "utf8"),
  );
  assert.equal(portfolio.student.firstName, "Fictional Ada");
  assert.equal(portfolio.assignments[0].submissions[0].reviews[0].score, 100);
  assert.equal(
    portfolio.assignments[0].submissions[0].evidence[0].name,
    "synthetic.png",
  );
  await page.screenshot({
    path: ".test-build/work-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".test-build/work-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "No horizontal overflow on mobile",
  );
  await page
    .getByLabel("Child", { exact: true })
    .selectOption({ label: "Fictional Ben" });
  await expect(
    page.getByRole("heading", { name: "Garden seed arithmetic" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("No assignments in this view.", { exact: true }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser: assignment, PNG evidence, parent approval, year portfolio download, child switch, desktop/mobile layout; no browser exceptions.",
  );
} catch (error) {
  const pages = browser?.contexts()[0]?.pages();
  if (pages?.[0]) {
    await pages[0].screenshot({
      path: ".test-build/work-failure.png",
      fullPage: true,
    });
    console.error((await pages[0].locator("body").innerText()).slice(0, 3000));
  }
  throw error;
} finally {
  await browser?.close();
  await vite.close();
  await new Promise<void>((r, j) => api.close((e: Error) => (e ? j(e) : r())));
  await fixture.close();
}
