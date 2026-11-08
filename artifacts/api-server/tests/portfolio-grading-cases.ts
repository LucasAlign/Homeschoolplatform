import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
export async function portfolioGradingCases(base: string, fixture: PGlite) {
  process.env.AUTH_MODE = "family";
  process.env.LOCAL_FAMILY_SIGNUP = "true";
  delete process.env.GRADING_PROVIDER;
  type User = { cookie: string; csrf: string };
  async function call(path: string, body?: unknown, user?: User) {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "AnchorOne",
        ...(user ? { Cookie: user.cookie, "X-CSRF-Token": user.csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers,
    };
  }
  const password = "Synthetic portfolio password!";
  async function login(username: string) {
    const response = await call("/auth/login", { username, password });
    assert.equal(response.status, 200);
    return {
      cookie: response.headers.get("set-cookie")!.split(";")[0],
      csrf: response.body.csrfToken,
    };
  }
  try {
    for (const username of ["portfolio-parent", "portfolio-foreign"])
      assert.equal(
        (
          await call("/auth/register", {
            username,
            password,
            name: "Fictional parent",
          })
        ).status,
        201,
      );
    const parent = await login("portfolio-parent"),
      foreign = await login("portfolio-foreign");
    const profile = {
      firstName: "Fictional learner",
      lastName: "Private surname",
      age: 8,
      gradeLevel: "3",
      learningStyle: "mixed",
      supportNotes: "PRIVATE SUPPORT NOTE",
    };
    const student = (await call("/students", profile, parent)).body;
    const other = (await call("/students", profile, foreign)).body;
    assert.equal(
      (
        await call(
          `/auth/children/${student.id}`,
          { username: "portfolio-child", password },
          parent,
        )
      ).status,
      201,
    );
    const child = await login("portfolio-child");
    const path = `/students/${student.id}/work`;
    const input = {
      title: "Selected arithmetic",
      subject: "Math",
      curriculum: "Sample workbook",
      sourceType: "textbook",
      instructions: "Add two and three.",
      resourceUrl: null,
      dueDate: "2026-11-08",
      schoolYear: "2026-27",
      rubric: "Answer key: Five",
    };
    const assignment = (await call(path, input, parent)).body;
    const excluded = (
      await call(path, { ...input, title: "EXCLUDED WORK" }, parent)
    ).body;
    const wrongYear = (
      await call(path, { ...input, schoolYear: "2027-28" }, parent)
    ).body;
    const foreignAssignment = (
      await call(`/students/${other.id}/work`, input, foreign)
    ).body;
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    const submission = (
      await call(
        `${path}/${assignment.id}/submissions`,
        { notes: "Five", evidence: [{ name: "synthetic.png", dataUrl: png }] },
        child,
      )
    ).body;
    const draftsPath = `${path}/${assignment.id}/grading-drafts`;
    assert.equal((await call(draftsPath, undefined, child)).status, 403);
    assert.equal(
      (await call(draftsPath, { submissionId: submission.id }, child)).status,
      403,
    );
    assert.equal((await call(draftsPath, undefined, foreign)).status, 404);
    const unavailable = await call(
      draftsPath,
      { submissionId: submission.id },
      parent,
    );
    assert.equal(unavailable.status, 201);
    assert.equal(unavailable.body.status, "unavailable");
    assert.equal(unavailable.body.score, null);
    process.env.GRADING_PROVIDER = "synthetic";
    const draft = await call(
      draftsPath,
      { submissionId: submission.id },
      parent,
    );
    assert.equal(draft.status, 201);
    assert.equal(draft.body.status, "simulated");
    assert.equal(draft.body.score, 100);
    assert.match(draft.body.feedback, /Synthetic test only/);
    const unchanged = (
      await call(path, undefined, parent)
    ).body.assignments.find((a: { id: string }) => a.id === assignment.id);
    assert.equal(unchanged.status, "submitted");
    assert.equal(unchanged.submissions[0].reviews.length, 0);
    const reviewPath = `${path}/${assignment.id}/reviews`;
    const review = {
      submissionId: submission.id,
      decision: "approved",
      feedback: draft.body.feedback,
      score: draft.body.score,
      gradingDraftId: draft.body.id,
      draftAction: "accepted",
    };
    assert.equal(
      (
        await call(
          reviewPath,
          { ...review, feedback: "Edited but claiming acceptance" },
          parent,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await call(
          reviewPath,
          { ...review, gradingDraftId: unavailable.body.id },
          parent,
        )
      ).status,
      409,
    );
    assert.equal((await call(reviewPath, review, parent)).status, 201);
    assert.equal(
      (
        await call(
          reviewPath,
          {
            ...review,
            draftAction: "overridden",
            feedback: "Parent checked the explanation independently.",
            score: 90,
          },
          parent,
        )
      ).status,
      201,
    );
    const options = {
      schoolYear: "2026-27",
      assignmentIds: [assignment.id],
      includeEvidence: true,
      includeFeedback: true,
      includeHistory: false,
    };
    assert.equal(
      (await call(path + "/portfolio/preview", options, child)).status,
      403,
    );
    assert.equal(
      (await call(path + "/portfolio/preview", options, foreign)).status,
      404,
    );
    for (const id of [wrongYear.id, foreignAssignment.id, "missing"])
      assert.equal(
        (
          await call(
            path + "/portfolio/preview",
            { ...options, assignmentIds: [id] },
            parent,
          )
        ).status,
        404,
      );
    for (const ids of [
      [],
      [assignment.id, assignment.id],
      Array.from({ length: 31 }, (_, i) => String(i)),
    ])
      assert.equal(
        (
          await call(
            path + "/portfolio/preview",
            { ...options, assignmentIds: ids },
            parent,
          )
        ).status,
        400,
      );
    const report = await call(path + "/portfolio/preview", options, parent);
    assert.equal(report.status, 200);
    assert.equal(report.headers.get("cache-control"), "no-store");
    assert.equal(report.body.work.length, 1);
    assert.equal(report.body.work[0].attempts[0].evidence[0].dataUrl, png);
    assert.equal(report.body.work[0].attempts[0].reviews.length, 1);
    assert.equal(report.body.work[0].attempts[0].reviews[0].score, 90);
    assert.match(
      report.body.work[0].attempts[0].reviews[0].provenance,
      /synthetic/,
    );
    const serialized = JSON.stringify(report.body);
    for (const secret of [
      "PRIVATE SUPPORT NOTE",
      "Private surname",
      "EXCLUDED WORK",
      "Answer key: Five",
      "rubricSnapshot",
      "sourceHash",
    ])
      assert.equal(serialized.includes(secret), false);
    const history = (
      await call(
        path + "/portfolio/preview",
        { ...options, includeHistory: true },
        parent,
      )
    ).body;
    assert.equal(history.work[0].attempts[0].reviews.length, 2);
    const minimal = (
      await call(
        path + "/portfolio/preview",
        { ...options, includeEvidence: false, includeFeedback: false },
        parent,
      )
    ).body;
    assert.equal(minimal.work[0].attempts[0].evidence.length, 0);
    assert.equal(minimal.work[0].attempts[0].reviews.length, 0);
    // A new submission makes prior drafts unusable even when their text still matches.
    assert.equal(
      (
        await call(
          reviewPath,
          {
            ...review,
            decision: "needs_revision",
            draftAction: "overridden",
            feedback: "Revise",
          },
          parent,
        )
      ).status,
      201,
    );
    const revision = (
      await call(
        `${path}/${assignment.id}/submissions`,
        { notes: "Five, with explanation", evidence: [] },
        child,
      )
    ).body;
    assert.equal(
      (await call(reviewPath, { ...review, submissionId: revision.id }, parent))
        .status,
      409,
    );
    assert.equal(
      (await call(draftsPath, { submissionId: submission.id }, parent)).status,
      409,
    );
    const imageSubmission = (
      await call(
        `${path}/${excluded.id}/submissions`,
        { notes: "", evidence: [{ name: "sample.png", dataUrl: png }] },
        child,
      )
    ).body;
    assert.equal(
      (
        await call(
          `${path}/${excluded.id}/grading-drafts`,
          { submissionId: imageSubmission.id },
          parent,
        )
      ).body.status,
      "unavailable",
    );
    // Simulate a future rubric edit: even a latest-submission draft must be rejected.
    const newDraft = (
      await call(draftsPath, { submissionId: revision.id }, parent)
    ).body;
    await fixture.query("UPDATE assignments SET rubric = $1 WHERE id = $2", [
      "Changed rubric",
      assignment.id,
    ]);
    assert.equal(
      (
        await call(
          reviewPath,
          {
            ...review,
            submissionId: revision.id,
            gradingDraftId: newDraft.id,
            draftAction: "overridden",
          },
          parent,
        )
      ).status,
      409,
    );
  } finally {
    process.env.AUTH_MODE = "synthetic";
    delete process.env.LOCAL_FAMILY_SIGNUP;
    delete process.env.GRADING_PROVIDER;
  }
}
