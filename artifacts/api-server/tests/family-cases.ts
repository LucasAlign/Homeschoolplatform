import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
export async function familyCases(base: string, fixture: PGlite) {
  process.env.AUTH_MODE = "family";
  process.env.LOCAL_FAMILY_SIGNUP = "true";
  const password = "Fictional family password 2026!";
  type Identity = { cookie: string; csrf: string };
  const request = async (
    path: string,
    body?: unknown,
    who?: Identity,
    method?: string,
    headers: Record<string, string> = {},
  ) => {
    const response = await fetch(base + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "AnchorOne",
        ...(who ? { Cookie: who.cookie, "X-CSRF-Token": who.csrf } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: response.status === 204 ? null : await response.json(),
      headers: response.headers,
    };
  };
  const login = async (username: string, secret = password, old?: Identity) => {
    const result = await request(
      "/auth/login",
      { username, password: secret },
      old,
    );
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const setCookie = result.headers.get("set-cookie")!;
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.match(setCookie, /Path=\/api/);
    return {
      cookie: setCookie.split(";")[0],
      csrf: result.data.csrfToken,
    } as Identity;
  };
  try {
    assert.equal(
      (
        await request("/students", undefined, undefined, undefined, {
          "X-User-Id": "demo-parent",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(
          "/auth/register",
          { name: "Fixture A", username: "family-a", password },
          undefined,
          undefined,
          { "X-Requested-With": "" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/auth/register",
          { name: "Fixture A", username: "family-a", password },
          undefined,
          undefined,
          { Origin: "http://localhost:9999" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/auth/register", {
          name: "Fixture A",
          username: "family-a",
          password,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await request("/auth/register", {
          name: "Fixture B",
          username: "family-b",
          password,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await request("/auth/login", {
          username: "family-a",
          password: "wrong",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/auth/login", {
          username: "unknown-user",
          password: "wrong",
        })
      ).status,
      401,
    );
    const parent = await login("family-a");
    const other = await login("family-b");
    const studentBody = {
      firstName: "Synthetic",
      lastName: "A",
      age: 8,
      gradeLevel: "3",
      learningStyle: "mixed",
      supportNotes: "Parent-only support notes",
    };
    assert.equal(
      (await request("/students", studentBody, { ...parent, csrf: "" })).status,
      403,
    );
    const child = (await request("/students", studentBody, parent)).data;
    const sibling = (
      await request(
        "/students",
        { ...studentBody, firstName: "Sibling" },
        parent,
      )
    ).data;
    const foreign = (
      await request(
        "/students",
        { ...studentBody, firstName: "Family B child" },
        other,
      )
    ).data;
    assert.equal(
      (
        await request(
          `/auth/children/${foreign.id}`,
          { username: "cross-family", password },
          parent,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/auth/children/${child.id}`,
          { username: "child-a", password },
          parent,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          `/auth/children/${child.id}`,
          { username: "child-duplicate", password },
          parent,
        )
      ).status,
      409,
    );
    const student = await login("child-a");
    const childList = await request("/students", undefined, student);
    assert.equal(childList.data.length, 1);
    assert.equal(childList.data[0].id, child.id);
    assert.equal("supportNotes" in childList.data[0], false);
    assert.equal(
      (await request(`/students/${sibling.id}`, undefined, student)).status,
      404,
    );
    assert.equal(
      (await request("/students", studentBody, student)).status,
      403,
    );
    assert.equal((await request("/courses", undefined, student)).status, 403);
    const path = `/students/${child.id}/work`;
    const input = {
      title: "Private lesson",
      subject: "Math",
      curriculum: "Sample",
      sourceType: "offline",
      instructions: "Show 2 + 3",
      resourceUrl: null,
      dueDate: "2026-11-08",
      schoolYear: "2026-27",
      rubric: "Private answer key: five",
    };
    assert.equal((await request(path, input, student)).status, 403);
    const assignment = await request(path, input, parent);
    assert.equal(assignment.status, 201);
    const { dueDate: _date, ...curriculum } = input;
    const schedule = {
      ...curriculum,
      startDate: "2026-11-06",
      count: 3,
      weekdays: [1, 2, 3, 4, 5],
      skipDates: ["2026-11-09"],
      requestId: "2f847616-7cba-4cc5-a8d7-1bbcd70caf30",
    };
    assert.equal(
      (await request(path + "/schedule", schedule, student)).status,
      403,
    );
    const batch = await request(path + "/schedule", schedule, parent);
    assert.equal(batch.status, 201);
    const retry = await request(path + "/schedule", schedule, parent);
    assert.equal(retry.status, 200);
    assert.deepEqual(retry.data.assignmentIds, batch.data.assignmentIds);
    assert.equal(
      (await request(path + "/schedule", { ...schedule, count: 4 }, parent))
        .status,
      409,
    );
    assert.equal(
      (await request(path + "/schedule", { ...schedule, weekdays: [] }, parent))
        .status,
      400,
    );
    const planned = (
      await request(path, undefined, parent)
    ).data.assignments.filter((a: { id: string }) =>
      batch.data.assignmentIds.includes(a.id),
    );
    assert.deepEqual(
      planned.map((a: { dueDate: string }) => a.dueDate),
      ["2026-11-06", "2026-11-10", "2026-11-11"],
    );
    assert.equal(
      (await request(`/students/${child.id}/work`, undefined, other)).status,
      404,
    );
    assert.equal(
      (await request(`/students/${sibling.id}/work`, undefined, student))
        .status,
      404,
    );
    const work = await request(path, undefined, student);
    assert.ok(work.data.assignments.every((a: object) => !("rubric" in a)));
    assert.equal("supportNotes" in work.data.student, false);
    assert.equal(
      (await request(path, undefined, parent)).data.assignments[0].rubric,
      input.rubric,
    );
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    const submission = await request(
      `${path}/${assignment.data.id}/submissions`,
      { notes: "Five", evidence: [{ name: "sample.png", dataUrl: png }] },
      student,
    );
    assert.equal(submission.status, 201);
    const review = {
      submissionId: submission.data.id,
      decision: "approved",
      feedback: "Good explanation",
      score: 100,
    };
    assert.equal(
      (await request(`${path}/${assignment.data.id}/reviews`, review, student))
        .status,
      403,
    );
    const approved = await request(
      `${path}/${assignment.data.id}/reviews`,
      review,
      parent,
    );
    assert.equal(approved.status, 201);
    assert.notEqual(approved.data.reviewerId, "demo-parent");
    const evidence = (
      await request(path, undefined, student)
    ).data.assignments.find((a: { id: string }) => a.id === assignment.data.id)
      .submissions[0].evidence[0];
    assert.equal("dataUrl" in evidence, false);
    assert.match(evidence.url, /\/evidence\/0$/);
    const evidenceUrl = new URL(base).origin + evidence.url;
    assert.equal((await fetch(evidenceUrl)).status, 401);
    assert.equal(
      (await fetch(evidenceUrl, { headers: { Cookie: other.cookie } })).status,
      404,
    );
    const image = await fetch(evidenceUrl, {
      headers: { Cookie: student.cookie },
    });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal(image.headers.get("cache-control"), "no-store");
    assert.equal(image.headers.get("x-content-type-options"), "nosniff");
    assert.ok((await image.arrayBuffer()).byteLength > 8);
    assert.equal(
      (await request(path + "/portfolio?year=2026-27", undefined, student))
        .status,
      403,
    );
    assert.equal(
      (
        await request(path + "/portfolio?year=2026-27", undefined, parent)
      ).data.assignments.find(
        (a: { id: string }) => a.id === assignment.data.id,
      ).submissions[0].evidence[0].dataUrl,
      png,
    );
    const course = await request(
      "/courses",
      { title: "Family A curriculum" },
      parent,
    );
    assert.equal(course.status, 201);
    const unit = await request(
      `/courses/${course.data.id}/units`,
      { title: "Unit" },
      parent,
    );
    const lesson = await request(
      `/units/${unit.data.id}/lessons`,
      { title: "Lesson" },
      parent,
    );
    assert.equal(
      (await request(`/courses/${course.data.id}`, undefined, other)).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/units/${unit.data.id}/lessons`,
          { title: "Intrusion" },
          other,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/lessons/${lesson.data.id}`,
          { title: "Intrusion" },
          other,
          "PATCH",
        )
      ).status,
      404,
    );
    assert.equal(
      (await request(`/units/${unit.data.id}`, undefined, other, "DELETE"))
        .status,
      404,
    );
    const rows = await fixture.query<{ token_hash: string }>(
      "SELECT token_hash FROM sessions",
    );
    assert.ok(
      rows.rows.every((row) => !parent.cookie.includes(row.token_hash)),
    );
    const hashes = await fixture.query<{ password_hash: string }>(
      "SELECT password_hash FROM credentials",
    );
    assert.ok(
      hashes.rows.every(
        (row) =>
          row.password_hash.startsWith("scrypt-v1$") &&
          !row.password_hash.includes(password),
      ),
    );
    const rotated = await login("family-a", password, parent);
    assert.equal((await request("/students", undefined, parent)).status, 401);
    assert.equal((await request("/auth/logout", {}, rotated)).status, 204);
    assert.equal(
      (await fetch(evidenceUrl, { headers: { Cookie: rotated.cookie } }))
        .status,
      401,
    );
    assert.equal((await request("/students", undefined, rotated)).status, 401);
    const session1 = await login("family-a");
    const session2 = await login("family-a");
    const newPassword = "Changed fictional password 2026!";
    assert.equal(
      (
        await request(
          "/auth/password",
          { currentPassword: password, newPassword },
          session1,
        )
      ).status,
      204,
    );
    assert.equal((await request("/students", undefined, session2)).status, 401);
    assert.equal(
      (await request("/auth/login", { username: "family-a", password })).status,
      401,
    );
    await login("family-a", newPassword);
    await fixture.exec(
      "UPDATE sessions SET expires_at = NOW() - INTERVAL '1 second'",
    );
    assert.equal((await request("/students", undefined, student)).status, 401);
    const idle = await login("child-a");
    await fixture.exec(
      "UPDATE sessions SET last_seen_at = NOW() - INTERVAL '31 minutes'",
    );
    assert.equal((await request("/students", undefined, idle)).status, 401);
    for (let i = 0; i < 8; i++)
      assert.equal(
        (
          await request("/auth/login", {
            username: "limited-user",
            password: "wrong",
          })
        ).status,
        401,
      );
    assert.equal(
      (
        await request("/auth/login", {
          username: "limited-user",
          password: "wrong",
        })
      ).status,
      429,
    );
  } finally {
    process.env.AUTH_MODE = "synthetic";
    delete process.env.LOCAL_FAMILY_SIGNUP;
  }
}
