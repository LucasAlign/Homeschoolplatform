import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, unitsTable, lessonsTable } from "@workspace/db";
import { eq, desc, count, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { DEMO_USER_ID, ensureDemoUser } from "../lib/user";

const router = Router();

// List courses
router.get("/courses", async (req, res): Promise<void> => {
  await ensureDemoUser();

  const courses = await db
    .select()
    .from(coursesTable)
    .where(eq(coursesTable.ownerId, DEMO_USER_ID))
    .orderBy(desc(coursesTable.createdAt));

  const unitCounts = await db
    .select({ courseId: unitsTable.courseId, count: count() })
    .from(unitsTable)
    .groupBy(unitsTable.courseId);

  const lessonCounts = await db
    .select({ courseId: unitsTable.courseId, count: count() })
    .from(lessonsTable)
    .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
    .groupBy(unitsTable.courseId);

  const unitCountMap = Object.fromEntries(unitCounts.map((u) => [u.courseId, Number(u.count)]));
  const lessonCountMap = Object.fromEntries(lessonCounts.map((l) => [l.courseId, Number(l.count)]));

  res.json(
    courses.map((c) => ({
      ...c,
      gradeLevel: c.gradeLevel ?? null,
      description: c.description ?? null,
      subject: c.subject ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      unitCount: unitCountMap[c.id] ?? 0,
      lessonCount: lessonCountMap[c.id] ?? 0,
    })),
  );
});

// Create course
router.post("/courses", async (req, res): Promise<void> => {
  await ensureDemoUser();
  const { title, description, subject, gradeLevel } = req.body;

  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  const [course] = await db
    .insert(coursesTable)
    .values({
      id: nanoid(),
      title: String(title).trim(),
      description: description ? String(description).trim() || null : null,
      subject: subject ? String(subject).trim() || null : null,
      gradeLevel: gradeLevel ? String(gradeLevel).trim() || null : null,
      published: false,
      ownerId: DEMO_USER_ID,
    })
    .returning();

  res.status(201).json({
    ...course,
    description: course.description ?? null,
    subject: course.subject ?? null,
    gradeLevel: course.gradeLevel ?? null,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  });
});

// Get course detail
router.get("/courses/:id", async (req, res): Promise<void> => {
  await ensureDemoUser();
  const { id } = req.params;

  const [course] = await db
    .select()
    .from(coursesTable)
    .where(and(eq(coursesTable.id, id), eq(coursesTable.ownerId, DEMO_USER_ID)));

  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  const units = await db
    .select()
    .from(unitsTable)
    .where(eq(unitsTable.courseId, id))
    .orderBy(unitsTable.order);

  const unitIds = units.map((u) => u.id);
  const allLessons =
    unitIds.length > 0
      ? await db
          .select()
          .from(lessonsTable)
          .where(inArray(lessonsTable.unitId, unitIds))
          .orderBy(lessonsTable.order)
      : [];

  const lessonsByUnit: Record<string, typeof allLessons> = {};
  for (const lesson of allLessons) {
    if (!lessonsByUnit[lesson.unitId]) lessonsByUnit[lesson.unitId] = [];
    lessonsByUnit[lesson.unitId].push(lesson);
  }

  res.json({
    ...course,
    description: course.description ?? null,
    subject: course.subject ?? null,
    gradeLevel: course.gradeLevel ?? null,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    units: units.map((u) => ({
      ...u,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
      lessons: (lessonsByUnit[u.id] ?? []).map((l) => ({
        ...l,
        createdAt: (l.createdAt as any) instanceof Date ? (l.createdAt as any).toISOString() : l.createdAt,
        updatedAt: (l.updatedAt as any) instanceof Date ? (l.updatedAt as any).toISOString() : l.updatedAt,
      })),
    })),
  });
});

// Update course
router.patch("/courses/:id", async (req, res): Promise<void> => {
  await ensureDemoUser();
  const { id } = req.params;
  const { title, description, subject, gradeLevel } = req.body;

  const [existing] = await db
    .select()
    .from(coursesTable)
    .where(and(eq(coursesTable.id, id), eq(coursesTable.ownerId, DEMO_USER_ID)));

  if (!existing) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  const [updated] = await db
    .update(coursesTable)
    .set({
      ...(title !== undefined ? { title: String(title).trim() } : {}),
      ...(description !== undefined ? { description: description ? String(description).trim() || null : null } : {}),
      ...(subject !== undefined ? { subject: subject ? String(subject).trim() || null : null } : {}),
      ...(gradeLevel !== undefined ? { gradeLevel: gradeLevel ? String(gradeLevel).trim() || null : null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(coursesTable.id, id))
    .returning();

  res.json({
    ...updated,
    description: updated.description ?? null,
    subject: updated.subject ?? null,
    gradeLevel: updated.gradeLevel ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// Delete course
router.delete("/courses/:id", async (req, res): Promise<void> => {
  await ensureDemoUser();
  const { id } = req.params;

  const [existing] = await db
    .select()
    .from(coursesTable)
    .where(and(eq(coursesTable.id, id), eq(coursesTable.ownerId, DEMO_USER_ID)));

  if (!existing) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  await db.delete(coursesTable).where(eq(coursesTable.id, id));
  res.sendStatus(204);
});

// Toggle published
router.patch("/courses/:id/publish", async (req, res): Promise<void> => {
  await ensureDemoUser();
  const { id } = req.params;
  const { published } = req.body;

  const [updated] = await db
    .update(coursesTable)
    .set({ published: Boolean(published), updatedAt: new Date() })
    .where(and(eq(coursesTable.id, id), eq(coursesTable.ownerId, DEMO_USER_ID)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  res.json({
    ...updated,
    description: updated.description ?? null,
    subject: updated.subject ?? null,
    gradeLevel: updated.gradeLevel ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

export default router;
