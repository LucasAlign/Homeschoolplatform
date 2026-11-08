import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { chromium, expect } from "@playwright/test";
process.env.NODE_ENV = "test";
process.env.AUTH_MODE = "family";
process.env.GRADING_PROVIDER = "synthetic";
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
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.route("**/*", (route) =>
    route.request().url().startsWith(origin) ||
    route.request().url().startsWith("data:")
      ? route.continue()
      : route.abort(),
  );
  const password = "Synthetic portfolio password!";
  const register = await context.request.post(origin + "/api/auth/register", {
    headers: { "X-Requested-With": "AnchorOne" },
    data: { username: "print-parent", password, name: "Fictional Parent" },
  });
  assert.equal(register.status(), 201);
  const login = await context.request.post(origin + "/api/auth/login", {
    headers: { "X-Requested-With": "AnchorOne" },
    data: { username: "print-parent", password },
  });
  assert.equal(login.status(), 200);
  const session = await login.json();
  const headers = {
    "X-Requested-With": "AnchorOne",
    "X-CSRF-Token": session.csrfToken,
  };
  const post = async (path: string, data: unknown) => {
    const response = await context.request.post(origin + "/api" + path, {
      headers,
      data,
    });
    assert.equal(response.status(), 201, await response.text());
    return response.json();
  };
  const student = await post("/students", {
    firstName: "Fictional Learner",
    lastName: "PRIVATE SURNAME",
    age: 8,
    gradeLevel: "3",
    learningStyle: "mixed",
    supportNotes: "PRIVATE SUPPORT NOTES",
  });
  await post(`/auth/children/${student.id}`, {
    username: "print-child",
    password,
  });
  const assignment = {
    title: "Arithmetic sample",
    subject: "Math",
    curriculum: "Synthetic workbook",
    sourceType: "textbook",
    instructions: "Add two and three.",
    resourceUrl: null,
    dueDate: "2026-01-01",
    schoolYear: "2026-27",
    rubric: "Answer key: Five",
  };
  await post(`/students/${student.id}/work`, assignment);
  await post(`/students/${student.id}/work`, {
    ...assignment,
    title: "Excluded assignment",
  });
  await context.request.post(origin + "/api/auth/logout", { headers });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const signIn = async (username: string) => {
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Each child's learning day" }),
    ).toBeVisible();
  };
  await page.goto(origin + "/work");
  await signIn("print-child");
  await expect(
    page.getByText("Build printable year portfolio", { exact: true }),
  ).toHaveCount(0);
  const card = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: "Arithmetic sample",
      exact: true,
    }),
  });
  await card.getByLabel("Notes", { exact: true }).fill("Five");
  await card.locator("input[type=file]").setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(
    card.getByRole("button", { name: "Submit for parent review" }),
  ).toBeEnabled();
  await card.getByRole("button", { name: "Submit for parent review" }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await signIn("print-parent");
  await page.getByLabel("Show", { exact: true }).selectOption("review");
  await card
    .getByText("Grading drafts (synthetic testing)", { exact: true })
    .click();
  await card
    .getByRole("button", { name: "Generate synthetic grading draft" })
    .click();
  await expect(
    card.getByText("Simulated suggestion: 100/100. Parent review required.", {
      exact: true,
    }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Use test draft in parent review" })
    .click();
  await expect(
    card.getByLabel("Draft review action", { exact: true }),
  ).toHaveValue("accepted");
  await card
    .getByLabel("Feedback", { exact: true })
    .fill("Parent independently reviewed this synthetic example.");
  await card.getByLabel(/^Score \(optional/).fill("90");
  await expect(
    card.getByLabel("Draft review action", { exact: true }),
  ).toHaveValue("overridden");
  await card.getByRole("button", { name: "Save parent review" }).click();
  await expect(card).toHaveCount(0);
  await page
    .getByText("Build printable year portfolio", { exact: true })
    .click();
  await page
    .getByLabel("Print school year", { exact: true })
    .selectOption("2026-27");
  await page.getByRole("checkbox", { name: /^Arithmetic sample/ }).check();
  await page
    .getByRole("button", { name: "Preview selected portfolio" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Learning portfolio", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Parent overridden a synthetic test draft. Not real AI grading.",
      { exact: false },
    ),
  ).toBeVisible();
  const text = await page.locator(".portfolio-sheet").innerText();
  for (const secret of [
    "PRIVATE SURNAME",
    "PRIVATE SUPPORT NOTES",
    "Excluded assignment",
    "Answer key: Five",
  ])
    assert.equal(text.includes(secret), false);
  assert.match(text, /90\/100/);
  await expect(page.locator(".portfolio-sheet img")).toHaveCount(1);
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printed = "true";
    };
  });
  await page
    .getByRole("button", { name: "Print / Save as PDF", exact: true })
    .click();
  await expect(page.locator("body")).toHaveAttribute("data-printed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.screenshot({
    path: ".test-build/portfolio-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".app-header")).toBeHidden();
  await expect(page.locator(".print-controls")).toBeHidden();
  await page.screenshot({
    path: ".test-build/portfolio-print.png",
    fullPage: true,
  });
  const pdf = await page.pdf({
    path: ".test-build/portfolio.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 10000);
  assert.deepEqual(errors, []);
  console.log(
    "PASS portfolio browser: child photo submission; parent-only grounded synthetic draft; explicit override; selected-year privacy; loaded evidence; print action; PDF generation; mobile layout.",
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({
      path: ".test-build/portfolio-failure.png",
      fullPage: true,
    });
    console.error((await page.locator("body").innerText()).slice(0, 4000));
  }
  throw error;
} finally {
  await browser?.close();
  await vite.close();
  await new Promise<void>((r, j) => api.close((e: Error) => (e ? j(e) : r())));
  await fixture.close();
}
