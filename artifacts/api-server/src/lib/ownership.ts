import { db, coursesTable, unitsTable, lessonsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export async function ownsUnit(id: string, ownerId: string) {
  const rows = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .innerJoin(coursesTable, eq(unitsTable.courseId, coursesTable.id))
    .where(and(eq(unitsTable.id, id), eq(coursesTable.ownerId, ownerId)));
  return rows.length > 0;
}
export async function ownsLesson(id: string, ownerId: string) {
  const rows = await db
    .select({ id: lessonsTable.id })
    .from(lessonsTable)
    .innerJoin(unitsTable, eq(lessonsTable.unitId, unitsTable.id))
    .innerJoin(coursesTable, eq(unitsTable.courseId, coursesTable.id))
    .where(and(eq(lessonsTable.id, id), eq(coursesTable.ownerId, ownerId)));
  return rows.length > 0;
}
