import { Router } from "express";
import { db } from "@workspace/db";
import { lessonsTable, unitsTable, coursesTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import { DEMO_USER_ID, ensureDemoUser } from "../lib/user";

const router = Router();

// Create lesson for a unit
router.post("/units/:unitId/lessons", async (req, res): Promise<void> => {
  await ensureDemoUser();
  const { unitId } = req.params;
  const { title } = req.body;

  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  const [countResult] = await db
    .select({ count: count() })
    .from(lessonsTable)
    .where(eq(lessonsTable.unitId, unitId));

  const [lesson] = await db
    .insert(lessonsTable)
    .values({
      id: nanoid(),
      title: String(title).trim(),
      content: "",
      unitId,
      order: Number(countResult?.count ?? 0),
    })
    .returning();

  res.status(201).json({
    ...lesson,
    createdAt: lesson.createdAt.toISOString(),
    updatedAt: lesson.updatedAt.toISOString(),
  });
});

// Get lesson detail
router.get("/lessons/:lessonId", async (req, res): Promise<void> => {
  await ensureDemoUser();
  const { lessonId } = req.params;

  const [lesson] = await db
    .select()
    .from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId));

  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }

  const [unit] = await db.select().from(unitsTable).where(eq(unitsTable.id, lesson.unitId));
  if (!unit) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }

  const [course] = await db
    .select()
    .from(coursesTable)
    .where(and(eq(coursesTable.id, unit.courseId), eq(coursesTable.ownerId, DEMO_USER_ID)));

  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  res.json({
    ...lesson,
    courseId: course.id,
    courseTitle: course.title,
    unitTitle: unit.title,
    createdAt: lesson.createdAt.toISOString(),
    updatedAt: lesson.updatedAt.toISOString(),
  });
});

// Update lesson
router.patch("/lessons/:lessonId", async (req, res): Promise<void> => {
  await ensureDemoUser();
  const { lessonId } = req.params;
  const { title, content, published } = req.body;

  const [existing] = await db
    .select()
    .from(lessonsTable)
    .where(eq(lessonsTable.id, lessonId));

  if (!existing) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }

  const [updated] = await db
    .update(lessonsTable)
    .set({
      ...(title !== undefined ? { title: String(title).trim() } : {}),
      ...(content !== undefined ? { content: content == null ? "" : String(content) } : {}),
      ...(published !== undefined ? { published: Boolean(published) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(lessonsTable.id, lessonId))
    .returning();

  res.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

// Delete lesson
router.delete("/lessons/:lessonId", async (req, res): Promise<void> => {
  await ensureDemoUser();
  const { lessonId } = req.params;

  await db.delete(lessonsTable).where(eq(lessonsTable.id, lessonId));
  res.sendStatus(204);
});

export default router;
