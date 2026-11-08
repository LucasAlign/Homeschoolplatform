import { Router } from "express";
import {
  db,
  studentsTable,
  assignmentsTable,
  submissionsTable,
  reviewsTable,
} from "@workspace/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { DEMO_USER_ID, ensureDemoUser } from "../lib/user";
import {
  assignmentInput,
  submissionInput,
  reviewInput,
} from "../lib/work-validation";

const router = Router();
router.use("/students/:studentId/work", async (req, res, next) => {
  await ensureDemoUser();
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.id, req.params.studentId),
        eq(studentsTable.ownerId, DEMO_USER_ID),
      ),
    );
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.locals.student = student;
  next();
});

router.get("/students/:studentId/work", async (req, res) => {
  const assignments = await db
    .select()
    .from(assignmentsTable)
    .where(eq(assignmentsTable.studentId, req.params.studentId))
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
  res.json({
    student: res.locals.student,
    assignments: assignments.map((a) => ({
      ...a,
      submissions: submissions
        .filter((s) => s.assignmentId === a.id)
        .map((s) => ({
          ...s,
          reviews: reviews.filter((r) => r.submissionId === s.id),
        })),
    })),
    ai: {
      status: "unavailable",
      reason:
        "No provider or sharing consent configured. Parent review is required.",
    },
  });
});

router.post("/students/:studentId/work", async (req, res) => {
  const parsed = assignmentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  const [assignment] = await db
    .insert(assignmentsTable)
    .values({ ...parsed.data, id: nanoid(), studentId: req.params.studentId })
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
            eq(assignmentsTable.id, req.params.assignmentId),
            eq(assignmentsTable.studentId, req.params.studentId),
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
            eq(assignmentsTable.id, req.params.assignmentId),
            eq(assignmentsTable.studentId, req.params.studentId),
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
        .values({ ...parsed.data, id: nanoid(), reviewerId: DEMO_USER_ID })
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
