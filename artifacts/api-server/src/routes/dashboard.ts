import { Router } from "express";
import { db } from "@workspace/db";
import { coursesTable, unitsTable, lessonsTable } from "@workspace/db";
import { eq, desc, count, and } from "drizzle-orm";
import { DEMO_USER_ID, ensureDemoUser } from "../lib/user";

const router = Router();

router.get("/dashboard", async (req, res): Promise<void> => {
  await ensureDemoUser();

  const [courseCountResult, lessonCountResult, recentCoursesRaw] = await Promise.all([
    db.select({ count: count() }).from(coursesTable).where(eq(coursesTable.ownerId, DEMO_USER_ID)),
    db
      .select({ count: count() })
      .from(lessonsTable)
      .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
      .innerJoin(coursesTable, and(eq(unitsTable.courseId, coursesTable.id), eq(coursesTable.ownerId, DEMO_USER_ID))),
    db
      .select()
      .from(coursesTable)
      .where(eq(coursesTable.ownerId, DEMO_USER_ID))
      .orderBy(desc(coursesTable.updatedAt))
      .limit(4),
  ]);

  // Get unit counts for recent courses
  const courseIds = recentCoursesRaw.map((c) => c.id);
  const unitCounts = courseIds.length > 0
    ? await db.select({ courseId: unitsTable.courseId, count: count() }).from(unitsTable).groupBy(unitsTable.courseId)
    : [];
  const lessonCounts = courseIds.length > 0
    ? await db
        .select({ courseId: unitsTable.courseId, count: count() })
        .from(lessonsTable)
        .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
        .groupBy(unitsTable.courseId)
    : [];

  const unitCountMap = Object.fromEntries(unitCounts.map((u) => [u.courseId, Number(u.count)]));
  const lessonCountMap = Object.fromEntries(lessonCounts.map((l) => [l.courseId, Number(l.count)]));

  const recentCourses = recentCoursesRaw.map((c) => ({
    ...c,
    gradeLevel: c.gradeLevel ?? null,
    description: c.description ?? null,
    subject: c.subject ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    unitCount: unitCountMap[c.id] ?? 0,
    lessonCount: lessonCountMap[c.id] ?? 0,
  }));

  res.json({
    courseCount: Number(courseCountResult[0]?.count ?? 0),
    lessonCount: Number(lessonCountResult[0]?.count ?? 0),
    recentCourses,
  });
});

export default router;
