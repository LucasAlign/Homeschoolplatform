import { Router } from "express";
import { db } from "@workspace/db";
import { unitsTable, coursesTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import { DEMO_USER_ID, ensureDemoUser } from "../lib/user";

const router = Router();

// Create unit for a course
router.post("/courses/:id/units", async (req, res): Promise<void> => {
  await ensureDemoUser();
  const { id: courseId } = req.params;
  const { title } = req.body;

  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  // Verify course ownership
  const [course] = await db
    .select()
    .from(coursesTable)
    .where(and(eq(coursesTable.id, courseId), eq(coursesTable.ownerId, DEMO_USER_ID)));

  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  const [countResult] = await db
    .select({ count: count() })
    .from(unitsTable)
    .where(eq(unitsTable.courseId, courseId));

  const [unit] = await db
    .insert(unitsTable)
    .values({
      id: nanoid(),
      title: String(title).trim(),
      courseId,
      order: Number(countResult?.count ?? 0),
    })
    .returning();

  res.status(201).json({
    ...unit,
    createdAt: unit.createdAt.toISOString(),
    updatedAt: unit.updatedAt.toISOString(),
  });
});

// Delete unit
router.delete("/units/:unitId", async (req, res): Promise<void> => {
  await ensureDemoUser();
  const { unitId } = req.params;

  await db.delete(unitsTable).where(eq(unitsTable.id, unitId));
  res.sendStatus(204);
});

export default router;
