import { Router } from "express";
import {
  db,
  studentsTable,
  assignmentsTable,
  submissionsTable,
  reviewsTable,
  scheduleBatchesTable,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { principal, requireParent, canAccessChild } from "../lib/session";
import { isRasterDataUrl } from "../lib/work-validation";
import { scheduleInput, planSchedule } from "../lib/schedule";
import { digest } from "../lib/passwords";
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
) {
  const assignments = await db
    .select()
    .from(assignmentsTable)
    .where(
      and(
        eq(assignmentsTable.studentId, studentId),
        schoolYear ? eq(assignmentsTable.schoolYear, schoolYear) : undefined,
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
