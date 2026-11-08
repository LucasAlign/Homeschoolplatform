import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { chromium, expect } from "@playwright/test";
process.env.NODE_ENV = "test";
process.env.AUTH_MODE = "family";
process.env.LOCAL_FAMILY_SIGNUP = "true";
process.env.SYNTHETIC_DATA_ONLY = "true";
process.env.LOG_LEVEL = "silent";
process.env.DATABASE_URL =
  "postgresql://synthetic:synthetic@127.0.0.1:5432/homeschool_synthetic";
const { app, fixture } = await import(
  pathToFileURL(resolve(".test-build/app.mjs")).href
);
const migrations = resolve("../../lib/db/drizzle");
for (const file of (await readdir(migrations))
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await fixture.exec(await readFile(resolve(migrations, file), "utf8"));
const api = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => api.once("listening", r));
const { createServer } = await import(
  pathToFileURL(
    createRequire(resolve("../homeschool/package.json")).resolve("vite"),
  ).href
);
const vite = await createServer({
  configFile: resolve("../homeschool/vite.config.ts"),
  server: {
    port: 0,
    host: "127.0.0.1",
    proxy: { "/api": `http://127.0.0.1:${api.address().port}` },
  },
});
let browser;
try {
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  process.env.LOCAL_APP_ORIGIN = origin;
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "msedge",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.route("**/*", (route) =>
    route.request().url().startsWith(origin) ||
    route.request().url().startsWith("data:")
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const password = "Synthetic browser password 2026!";
  await page.goto(origin + "/work");
  await page
    .getByRole("button", { name: "Create a fictional family account" })
    .click();
  await page
    .getByLabel("Parent display name", { exact: true })
    .fill("Fictional Parent");
  await page.getByLabel("Username", { exact: true }).fill("browser-parent");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create local family", exact: true })
    .click();
  const signIn = async (username: string) => {
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Each child's learning day" }),
    ).toBeVisible();
  };
  await signIn("browser-parent");
  const session = await (
    await context.request.get(origin + "/api/auth/session")
  ).json();
  const childResponse = await context.request.post(origin + "/api/students", {
    headers: {
      "X-CSRF-Token": session.csrfToken,
      "X-Requested-With": "AnchorOne",
    },
    data: {
      firstName: "Fictional Child",
      lastName: "Fixture",
      age: 8,
      gradeLevel: "3",
      learningStyle: "mixed",
      supportNotes: "Private parent notes",
    },
  });
  assert.equal(childResponse.status(), 201);
  await page.reload();
  await expect(
    page.getByText("Plan an assignment", { exact: true }),
  ).toBeVisible();
  await page.getByText("Create this child's login", { exact: true }).click();
  await page
    .getByLabel("Child username", { exact: true })
    .fill("browser-child");
  await page
    .getByLabel("Child password (15+ characters)", { exact: true })
    .fill(password);
  await page
    .getByRole("button", { name: "Create child login", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Child login created. Sign out to use the child account.",
  );
  await page.getByText("Plan an assignment", { exact: true }).click();
  for (const [label, value] of [
    ["Assignment title", "Reading practice"],
    ["Subject", "Reading"],
    ["Curriculum or book", "Sample book"],
    ["School year", "2026-27"],
    ["Instructions / pages / activity", "Read aloud and write a sentence."],
    ["Rubric or answer key for parent review", "Parent-only secret rubric"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel("Due date", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Number of lessons", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Save assignment", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Reading practice · Lesson 1",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn("browser-child");
  await expect(
    page.getByText("Plan an assignment", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Rubric / answer key (parent workspace)", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Download year portfolio" }),
  ).toHaveCount(0);
  assert.equal(
    (await page.locator("body").innerText()).includes(
      "Parent-only secret rubric",
    ),
    false,
  );
  const card = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", {
        name: "Reading practice · Lesson 1",
        exact: true,
      }),
    });
  await card
    .getByLabel("Notes", { exact: true })
    .fill("Synthetic reading completed.");
  await card.getByRole("button", { name: "Submit for parent review" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Reading practice · Lesson 1",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.screenshot({
    path: ".test-build/family-child.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn("browser-parent");
  await page.getByLabel("Show", { exact: true }).selectOption("review");
  await page.getByText("Parent review / override", { exact: true }).click();
  await page.getByLabel("Feedback", { exact: true }).fill("Reviewed by parent");
  await page.getByRole("button", { name: "Save parent review" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Reading practice · Lesson 1",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByLabel("Show", { exact: true }).selectOption("all");
  await expect(
    page.getByText("Parent: approved — Reviewed by parent", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".test-build/family-parent.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  const secondTab = await context.newPage();
  await secondTab.goto(origin + "/work");
  await expect(
    secondTab.getByRole("heading", { name: "Each child's learning day" }),
  ).toBeVisible();
  await page.getByText("Account password", { exact: true }).click();
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page
    .getByLabel("New password (15+ characters)", { exact: true })
    .fill("Changed browser password 2026!");
  await page
    .getByRole("button", { name: "Change password and sign out", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "AnchorOne family sign-in" }),
  ).toBeVisible();
  await expect(
    secondTab.getByRole("heading", { name: "AnchorOne family sign-in" }),
  ).toBeVisible();
  assert.deepEqual(errors, []);
  console.log(
    "PASS family browser: signup, verified cookie login, child credentials, recurring lessons, role-specific UI, child submission, parent review, logout isolation, password change with cross-tab clearing, mobile layout.",
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({
      path: ".test-build/family-failure.png",
      fullPage: true,
    });
    console.error((await page.locator("body").innerText()).slice(0, 2000));
  }
  throw error;
} finally {
  await browser?.close();
  await vite.close();
  await new Promise<void>((r, j) => api.close((e: Error) => (e ? j(e) : r())));
  await fixture.close();
}
