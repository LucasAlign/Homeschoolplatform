import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createRequire } from "node:module";
import type { Server } from "node:http";
import { request as httpRequest } from "node:http";
import { syntheticConfiguration } from "../src/lib/access";
import { assignmentInput, submissionInput } from "../src/lib/work-validation";
import { familyCases } from "./family-cases";
import { planSchedule, scheduleInput } from "../src/lib/schedule";

let server: Server;
let base: string;
let fixture: import("@electric-sql/pglite").PGlite;
test("verified family sessions enforce parent/child permissions, private evidence and session lifecycle", async () => {
  await familyCases(base, fixture);
});
const sample = {
  title: "Count garden seeds",
  subject: "Math",
  curriculum: "Fictional workbook",
  sourceType: "textbook",
  instructions: "Complete page 3",
  resourceUrl: null,
  dueDate: "2026-11-08",
  schoolYear: "2026-27",
  rubric: "Show how 2 + 3 = 5",
};
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
test("calendar schedules handle leap days and reject invalid or unbounded requests", () => {
  const { dueDate: _dueDate, ...assignment } = sample;
  const input = {
    ...assignment,
    startDate: "2028-02-28",
    count: 3,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    skipDates: [],
    requestId: "38a60686-310f-45c8-9458-d2c3ca276ceb",
  };
  assert.deepEqual(
    planSchedule(scheduleInput.parse(input)).map((a) => a.dueDate),
    ["2028-02-28", "2028-02-29", "2028-03-01"],
  );
  for (const change of [
    { count: 61 },
    { count: 0 },
    { weekdays: [] },
    { weekdays: [1, 1] },
    { startDate: "2027-02-29" },
  ])
    assert.equal(
      scheduleInput.safeParse({ ...input, ...change }).success,
      false,
    );
  assert.throws(() =>
    planSchedule(scheduleInput.parse({ ...input, startDate: "9999-12-31" })),
  );
});
async function request(
  path: string,
  body?: unknown,
  method?: string,
  headers?: Record<string, string>,
) {
  const response = await fetch(base + path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data, headers: response.headers };
}
before(async () => {
  process.env.NODE_ENV = "test";
  process.env.AUTH_MODE = "synthetic";
  process.env.SYNTHETIC_DATA_ONLY = "true";
  // Placeholder only. @workspace/db is replaced with a fresh in-memory PostgreSQL fixture.
  process.env.DATABASE_URL =
    "postgresql://synthetic:synthetic@127.0.0.1:5432/homeschool_synthetic";
  await mkdir(".test-build", { recursive: true });
  await build({
    stdin: {
      contents:
        'export { default as app } from "./src/app"; export { fixture } from "./tests/database";',
      resolveDir: process.cwd(),
    },
    outfile: ".test-build/app.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    plugins: [
      {
        name: "isolated-database",
        setup(b) {
          b.onResolve({ filter: /^@workspace\/db$/ }, () => ({
            path: resolve("tests/database.ts"),
          }));
          b.onResolve({ filter: /^drizzle-zod$/ }, () => ({
            path: pathToFileURL(
              createRequire(resolve("../../lib/db/package.json")).resolve(
                "drizzle-zod",
              ),
            ).href,
            external: true,
          }));
        },
      },
    ],
  });
  const module = await import(
    pathToFileURL(resolve(".test-build/app.mjs")).href
  );
  fixture = module.fixture;
  const migrationDir = resolve("../../lib/db/drizzle");
  for (const file of (await readdir(migrationDir))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await fixture.exec(await readFile(resolve(migrationDir, file), "utf8"));
  server = module.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
});
after(async () => {
  if (server)
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  await fixture?.close();
});

test("configuration rejects production, remote DB, missing opt-in, and database URL query overrides", () => {
  const env = {
    NODE_ENV: "test",
    SYNTHETIC_DATA_ONLY: "true",
    DATABASE_URL: "postgresql://a:b@127.0.0.1/homeschool_synthetic",
  };
  assert.equal(syntheticConfiguration(env), true);
  for (const change of [
    { NODE_ENV: "production" },
    { SYNTHETIC_DATA_ONLY: "false" },
    { DATABASE_URL: "postgresql://a:b@db.example.com/homeschool_synthetic" },
    { DATABASE_URL: "postgresql://a:b@127.0.0.1/real_family" },
    { DATABASE_URL: env.DATABASE_URL + "?host=remote" },
  ])
    assert.equal(syntheticConfiguration({ ...env, ...change }), false);
});
test("HTTP boundary rejects unconfigured access and cross-origin requests", async () => {
  process.env.AUTH_MODE = "unknown";
  try {
    assert.equal((await request("/students")).status, 503);
  } finally {
    process.env.AUTH_MODE = "synthetic";
  }
  process.env.NODE_ENV = "production";
  try {
    assert.equal((await request("/students")).status, 503);
  } finally {
    process.env.NODE_ENV = "test";
  }
  assert.equal(
    (
      await request("/students", undefined, undefined, {
        Origin: "https://attacker.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/students", undefined, undefined, {
        "Sec-Fetch-Site": "cross-site",
      })
    ).status,
    403,
  );
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = httpRequest(
      base + "/students",
      { headers: { Host: "attacker.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(status, 403);
  assert.equal(
    (await request("/students", { data: "x".repeat(3 * 1024 * 1024) })).status,
    413,
  );
  assert.equal((await request("/healthz")).status, 200);
});
test("validation rejects invalid dates, script links, empty submissions, SVG and oversized images", () => {
  for (const value of [
    { ...sample, dueDate: "2026-02-30" },
    { ...sample, resourceUrl: "javascript:alert(1)" },
    { ...sample, sourceType: "unsupported" },
  ])
    assert.equal(assignmentInput.safeParse(value).success, false);
  for (const value of [
    { notes: "", evidence: [] },
    {
      notes: "x",
      evidence: [{ name: "x", dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }],
    },
    {
      notes: "x",
      evidence: [
        { name: "x", dataUrl: "data:image/png;base64," + "A".repeat(1400000) },
      ],
    },
  ])
    assert.equal(submissionInput.safeParse(value).success, false);
  assert.equal(
    submissionInput.safeParse({
      notes: "",
      evidence: [{ name: "sample.png", dataUrl: png }],
    }).success,
    true,
  );
});
test("complete child-scoped assignment, revision, parent override and portfolio lifecycle", async () => {
  const student = await request("/students", {
    firstName: "Synthetic",
    lastName: "Learner",
    age: 8,
    gradeLevel: "3",
    learningStyle: "mixed",
  });
  assert.equal(student.status, 201);
  const other = await request("/students", {
    firstName: "Other",
    lastName: "Fixture",
    age: 9,
    gradeLevel: "4",
    learningStyle: "mixed",
  });
  const path = `/students/${student.data.id}/work`;
  const assignment = await request(path, sample);
  assert.equal(assignment.status, 201);
  const item = `${path}/${assignment.data.id}`;
  assert.equal(
    (
      await request(
        `/students/${other.data.id}/work/${assignment.data.id}/submissions`,
        { notes: "wrong child", evidence: [] },
      )
    ).status,
    404,
  );
  const first = await request(item + "/submissions", {
    notes: "First attempt",
    evidence: [{ name: "sample.png", dataUrl: png }],
  });
  assert.equal(first.status, 201);
  assert.equal(
    (await request(item + "/submissions", { notes: "duplicate", evidence: [] }))
      .status,
    409,
  );
  assert.equal(
    (
      await request(item + "/reviews", {
        submissionId: first.data.id,
        decision: "needs_revision",
        feedback: "Please show your work",
        score: null,
      })
    ).status,
    201,
  );
  const second = await request(item + "/submissions", {
    notes: "2 + 3 = 5",
    evidence: [],
  });
  assert.equal(second.status, 201);
  assert.equal(
    (
      await request(item + "/reviews", {
        submissionId: first.data.id,
        decision: "approved",
        feedback: "stale",
        score: 100,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(item + "/reviews", {
        submissionId: second.data.id,
        decision: "approved",
        feedback: "Correct with explanation",
        score: 100,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request(item + "/reviews", {
        submissionId: second.data.id,
        decision: "approved",
        feedback: "Parent correction",
        score: 95,
      })
    ).status,
    201,
  );
  const portfolio = (await request(path + "/portfolio?year=2026-27")).data;
  assert.equal(portfolio.assignments[0].status, "approved");
  assert.equal(portfolio.assignments[0].submissions.length, 2);
  assert.equal(
    portfolio.assignments[0].submissions[0].evidence[0].dataUrl,
    png,
  );
  assert.equal(portfolio.assignments[0].submissions[1].reviews.length, 2);
  assert.equal(portfolio.ai.status, "unavailable");
  assert.equal(
    (await request(`/students/${other.data.id}/work`)).data.assignments.length,
    0,
  );
  for (const sourceType of ["offline", "website", "custom"])
    assert.equal((await request(path, { ...sample, sourceType })).status, 201);
  const concurrent = await request(path, sample);
  const results = await Promise.all(
    [1, 2].map(() =>
      request(`${path}/${concurrent.data.id}/submissions`, {
        notes: "concurrent attempt",
        evidence: [],
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});
test("foreign family resources reject student, unit and lesson access and mutations", async () => {
  await fixture.exec(`INSERT INTO users(id,email,name) VALUES ('foreign','fictional@example.invalid','Fixture');
    INSERT INTO students(id,first_name,last_name,age,grade_level,learning_style,owner_id) VALUES ('foreign-child','Fictional','Child',8,'3','mixed','foreign');
    INSERT INTO courses(id,title,owner_id) VALUES ('foreign-course','Private fixture','foreign');
    INSERT INTO units(id,title,course_id) VALUES ('foreign-unit','Private unit','foreign-course');
    INSERT INTO lessons(id,title,unit_id) VALUES ('foreign-lesson','Private lesson','foreign-unit');`);
  assert.equal((await request("/students/foreign-child/work")).status, 404);
  assert.equal(
    (await request("/students/foreign-child/work", sample)).status,
    404,
  );
  assert.equal(
    (await request("/units/foreign-unit/lessons", { title: "Intrusion" }))
      .status,
    404,
  );
  assert.equal(
    (await request("/units/foreign-unit", undefined, "DELETE")).status,
    404,
  );
  assert.equal((await request("/lessons/foreign-lesson")).status, 404);
  assert.equal(
    (await request("/lessons/foreign-lesson", { title: "Intrusion" }, "PATCH"))
      .status,
    404,
  );
  assert.equal(
    (await request("/lessons/foreign-lesson", undefined, "DELETE")).status,
    404,
  );
  assert.equal(
    (await request("/students")).data.some(
      (s: { id: string }) => s.id === "foreign-child",
    ),
    false,
  );
});
