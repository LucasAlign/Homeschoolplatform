import { Router } from "express";
import {
  db,
  studentsTable,
  assignmentsTable,
  submissionsTable,
  reviewsTable,
  scheduleBatchesTable,
  gradingDraftsTable,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { principal, requireParent, canAccessChild } from "../lib/session";
import { isRasterDataUrl } from "../lib/work-validation";
import { scheduleInput, planSchedule } from "../lib/schedule";
import { digest } from "../lib/passwords";
import { z } from "zod/v4";
import {
  runGrading,
  gradingSourceHash,
  gradingAvailability,
} from "../lib/grading";
import { portfolioInput, printablePortfolio } from "../lib/portfolio";
import {
  assignmentInput,
  submissionInput,
  reviewInput,
} from "../lib/work-validation";

const router = Router();
router.use("/students/:studentId/work", async (req, res, next) => {
  if (!canAccessChild(res, String(req.params.studentId))) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const [student] = await db
    .select()
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.id, String(req.params.studentId)),
        eq(studentsTable.ownerId, principal(res).ownerId),
      ),
    );
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.locals.student = student;
  next();
});

async function loadWork(
  studentId: string,
  parent: boolean,
  includeEvidence = false,
  schoolYear?: string,
  selectedIds?: string[],
) {
  const assignments = await db
    .select()
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.studentId, studentId),
        schoolYear ? eq(assignmentsTable.schoolYear, schoolYear) : undefined,
        selectedIds ? inArray(assignmentsTable.id, selectedIds) : undefined,
      ),
    )
    .orderBy(asc(assignmentsTable.dueDate), asc(assignmentsTable.id));
  const submissions = assignments.length
    ? await db
        .select()
        .from(submissionsTable)
        .where(
          inArray(
            submissionsTable.assignmentId,
            assignments.map((a) => a.id),
          ),
        )
        .orderBy(asc(submissionsTable.createdAt), asc(submissionsTable.id))
    : [];
  const reviews = submissions.length
    ? await db
        .select()
        .from(reviewsTable)
        .where(
          inArray(
            reviewsTable.submissionId,
            submissions.map((s) => s.id),
          ),
        )
        .orderBy(asc(reviewsTable.createdAt))
    : [];
  return {
    assignments: assignments.map((a) => ({
      ...a,
      ...(!parent ? { rubric: undefined } : {}),
      submissions: submissions
        .filter((s) => s.assignmentId === a.id)
        .map((s) => ({
          ...s,
          evidence: s.evidence.map((e, index) =>
            includeEvidence
              ? e
              : {
                  name: e.name,
                  url: `/api/students/${studentId}/work/${a.id}/submissions/${s.id}/evidence/${index}`,
                },
          ),
          reviews: reviews.filter((r) => r.submissionId === s.id),
        })),
    })),
    ai: {
      status: "unavailable",
      reason:
        "No provider or sharing consent configured. Parent review is required.",
    },
  };
}
router.get("/students/:studentId/work", async (req, res) => {
  const student = res.locals.student;
  const parent = principal(res).role === "parent";
  res.json({
    student: parent
      ? student
      : {
          id: student.id,
          firstName: student.firstName,
          preferredName: student.preferredName,
        },
    ...(await loadWork(String(req.params.studentId), parent)),
  });
});
router.get(
  "/students/:studentId/work/portfolio",
  requireParent,
  async (req, res) => {
    const year = req.query.year;
    if (typeof year !== "string" || !year.trim() || year.length > 200) {
      res.status(400).json({ error: "Choose a school year." });
      return;
    }
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      schoolYear: year,
      student: res.locals.student,
      ...(await loadWork(String(req.params.studentId), true, true, year)),
    });
  },
);
router.post(
  "/students/:studentId/work/portfolio/preview",
  requireParent,
  async (req, res) => {
    const parsed = portfolioInput.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Choose a school year and 1–30 distinct assignments." });
      return;
    }
    const work = await loadWork(
      String(req.params.studentId),
      true,
      parsed.data.includeEvidence,
      parsed.data.schoolYear,
      parsed.data.assignmentIds,
    );
    if (work.assignments.length !== parsed.data.assignmentIds.length) {
      res
        .status(404)
        .json({
          error:
            "Selected work is not available for this child and school year.",
        });
      return;
    }
    const report = printablePortfolio(
      res.locals.student,
      work.assignments,
      parsed.data,
    );
    if (Buffer.byteLength(JSON.stringify(report)) > 12 * 1024 * 1024) {
      res
        .status(413)
        .json({
          error:
            "This print selection is too large. Choose fewer assignments or omit images.",
        });
      return;
    }
    res.json(report);
  },
);
router.get(
  "/students/:studentId/work/:assignmentId/grading-drafts",
  requireParent,
  async (req, res) => {
    const [assignment] = await db
      .select()
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.id, String(req.params.assignmentId)),
          eq(assignmentsTable.studentId, String(req.params.studentId)),
        ),
      );
    if (!assignment) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    const drafts = await db
      .select({ draft: gradingDraftsTable })
      .from(gradingDraftsTable)
      .innerJoin(
        submissionsTable,
        eq(gradingDraftsTable.submissionId, submissionsTable.id),
      )
      .where(eq(submissionsTable.assignmentId, assignment.id))
      .orderBy(desc(gradingDraftsTable.createdAt), desc(gradingDraftsTable.id));
    res.json({
      availability: gradingAvailability(),
      drafts: drafts.map((row) => row.draft),
    });
  },
);
router.post(
  "/students/:studentId/work/:assignmentId/grading-drafts",
  requireParent,
  async (req, res) => {
    const parsed = z
      .object({ submissionId: z.string().min(1).max(200) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose a submission." });
      return;
    }
    const [assignment] = await db
      .select()
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.id, String(req.params.assignmentId)),
          eq(assignmentsTable.studentId, String(req.params.studentId)),
        ),
      );
    if (!assignment) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }
    const [submission] = await db
      .select()
      .from(submissionsTable)
      .where(eq(submissionsTable.assignmentId, assignment.id))
      .orderBy(desc(submissionsTable.createdAt), desc(submissionsTable.id))
      .limit(1);
    if (!submission || submission.id !== parsed.data.submissionId) {
      res
        .status(409)
        .json({ error: "Refresh and choose the latest submission." });
      return;
    }
    const sourceHash = gradingSourceHash(assignment.rubric, submission);
    // The provider receives rubric and typed text only: no child identity or image bytes.
    const result = await runGrading({
      rubric: assignment.rubric,
      notes: submission.notes,
      imageCount: submission.evidence.length,
    });
    const saved = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, assignment.id))
        .for("update");
      const [latest] = await tx
        .select()
        .from(submissionsTable)
        .where(eq(submissionsTable.assignmentId, assignment.id))
        .orderBy(desc(submissionsTable.createdAt), desc(submissionsTable.id))
        .limit(1);
      if (
        !current ||
        !latest ||
        latest.id !== submission.id ||
        gradingSourceHash(current.rubric, latest) !== sourceHash
      )
        return null;
      const [draft] = await tx
        .insert(gradingDraftsTable)
        .values({
          id: nanoid(),
          submissionId: submission.id,
          sourceHash,
          rubricSnapshot: assignment.rubric,
          createdBy: principal(res).userId,
          ...result,
        })
        .returning();
      return draft;
    });
    if (!saved) {
      res
        .status(409)
        .json({
          error:
            "Work changed while the draft was being generated. Generate a new draft.",
        });
      return;
    }
    res.status(201).json(saved);
  },
);
router.get(
  "/students/:studentId/work/:assignmentId/submissions/:submissionId/evidence/:index",
  async (req, res) => {
    const [record] = await db
      .select({ evidence: submissionsTable.evidence })
      .from(submissionsTable)
      .innerJoin(
        assignmentsTable,
        eq(submissionsTable.assignmentId, assignmentsTable.id),
      )
      .where(
        and(
          eq(assignmentsTable.studentId, String(req.params.studentId)),
          eq(assignmentsTable.id, String(req.params.assignmentId)),
          eq(submissionsTable.id, req.params.submissionId),
        ),
      );
    const index = Number(req.params.index);
    const evidence =
      Number.isInteger(index) && index >= 0
        ? record?.evidence[index]
        : undefined;
    if (!evidence || !isRasterDataUrl(evidence.dataUrl)) {
      res.status(404).json({ error: "Evidence not found" });
      return;
    }
    const mime = evidence.dataUrl.startsWith("data:image/png")
      ? "image/png"
      : "image/jpeg";
    res.set({
      "Content-Type": mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": `inline; filename="evidence.${mime === "image/png" ? "png" : "jpg"}"`,
    });
    res.send(Buffer.from(evidence.dataUrl.split(",")[1], "base64"));
  },
);

router.post(
  "/students/:studentId/work/schedule",
  requireParent,
  async (req, res) => {
    const parsed = scheduleInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    let planned;
    try {
      planned = planSchedule(parsed.data);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
    const studentId = String(req.params.studentId);
    const key = `${studentId}:${parsed.data.requestId}`;
    const fingerprint = digest(JSON.stringify(parsed.data));
    const result = await db.transaction(async (tx) => {
      await tx
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(eq(studentsTable.id, studentId))
        .for("update");
      const [existing] = await tx
        .select()
        .from(scheduleBatchesTable)
        .where(eq(scheduleBatchesTable.key, key));
      if (existing)
        return existing.fingerprint === fingerprint
          ? { status: 200, body: { assignmentIds: existing.assignmentIds } }
          : {
              status: 409,
              body: {
                error:
                  "This scheduling request was already used with different details.",
              },
            };
      const assignments = await tx
        .insert(assignmentsTable)
        .values(planned.map((a) => ({ ...a, id: nanoid(), studentId })))
        .returning({ id: assignmentsTable.id });
      const assignmentIds = assignments.map((a) => a.id);
      await tx
        .insert(scheduleBatchesTable)
        .values({ key, studentId, fingerprint, assignmentIds });
      return { status: 201, body: { assignmentIds } };
    });
    res.status(result.status).json(result.body);
  },
);

router.post("/students/:studentId/work", requireParent, async (req, res) => {
  const parsed = assignmentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const [assignment] = await db
    .insert(assignmentsTable)
    .values({
      ...parsed.data,
      id: nanoid(),
      studentId: String(req.params.studentId),
    })
    .returning();
  res.status(201).json(assignment);
});

router.post(
  "/students/:studentId/work/:assignmentId/submissions",
  async (req, res) => {
    const parsed = submissionInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [assignment] = await tx
        .select()
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.id, String(req.params.assignmentId)),
            eq(assignmentsTable.studentId, String(req.params.studentId)),
          ),
        )
        .for("update");
      if (!assignment)
        return { status: 404, body: { error: "Assignment not found" } };
      if (!["assigned", "needs_revision"].includes(assignment.status))
        return {
          status: 409,
          body: { error: "This assignment is already submitted or approved." },
        };
      const [submission] = await tx
        .insert(submissionsTable)
        .values({ ...parsed.data, id: nanoid(), assignmentId: assignment.id })
        .returning();
      await tx
        .update(assignmentsTable)
        .set({ status: "submitted" })
        .where(eq(assignmentsTable.id, assignment.id));
      return { status: 201, body: submission };
    });
    res.status(result.status).json(result.body);
  },
);

router.post(
  "/students/:studentId/work/:assignmentId/reviews",
  requireParent,
  async (req, res) => {
    const parsed = reviewInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [assignment] = await tx
        .select()
        .from(assignmentsTable)
        .where(
          and(
            eq(assignmentsTable.id, String(req.params.assignmentId)),
            eq(assignmentsTable.studentId, String(req.params.studentId)),
          ),
        )
        .for("update");
      if (!assignment)
        return { status: 404, body: { error: "Assignment not found" } };
      const [latest] = await tx
        .select()
        .from(submissionsTable)
        .where(eq(submissionsTable.assignmentId, assignment.id))
        .orderBy(desc(submissionsTable.createdAt), desc(submissionsTable.id))
        .limit(1);
      if (!latest || latest.id !== parsed.data.submissionId)
        return {
          status: 409,
          body: { error: "Refresh and review the latest submission." },
        };
      if (parsed.data.gradingDraftId) {
        const [draft] = await tx
          .select()
          .from(gradingDraftsTable)
          .where(
            and(
              eq(gradingDraftsTable.id, parsed.data.gradingDraftId),
              eq(gradingDraftsTable.submissionId, latest.id),
            ),
          );
        if (
          !draft ||
          draft.status !== "simulated" ||
          draft.sourceHash !== gradingSourceHash(assignment.rubric, latest)
        )
          return {
            status: 409,
            body: {
              error:
                "This draft is unavailable or stale. Generate a new draft or review manually.",
            },
          };
        if (
          parsed.data.draftAction === "accepted" &&
          (parsed.data.feedback !== draft.feedback ||
            parsed.data.score !== draft.score)
        )
          return {
            status: 400,
            body: {
              error:
                "Choose override when changing suggested feedback or score.",
            },
          };
      }
      const [review] = await tx
        .insert(reviewsTable)
        .values({
          ...parsed.data,
          id: nanoid(),
          reviewerId: principal(res).userId,
        })
        .returning();
      await tx
        .update(assignmentsTable)
        .set({ status: parsed.data.decision })
        .where(eq(assignmentsTable.id, assignment.id));
      return { status: 201, body: review };
    });
    res.status(result.status).json(result.body);
  },
);
export default router;
