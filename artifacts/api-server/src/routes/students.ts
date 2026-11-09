import { Router } from "express";
import { db, studentsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { principal, requireParent, canAccessChild } from "../lib/session";
const router = Router();
router.get("/students", async (_req, res): Promise<void> => {
  const user = principal(res);
  const students = await db
    .select()
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.ownerId, user.ownerId),
        user.role === "student"
          ? eq(studentsTable.id, user.studentId!)
          : undefined,
      ),
    )
    .orderBy(desc(studentsTable.createdAt));
  res.json(
    user.role === "parent"
      ? students
      : students.map(({ id, firstName, preferredName }) => ({
          id,
          firstName,
          preferredName,
        })),
  );
});
router.get("/students/:id", async (req, res): Promise<void> => {
  if (!canAccessChild(res, String(req.params.id))) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  const [student] = await db
    .select()
    .from(studentsTable)
    .where(
      and(
        eq(studentsTable.id, String(req.params.id)),
        eq(studentsTable.ownerId, principal(res).ownerId),
      ),
    );
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json(
    principal(res).role === "parent"
      ? student
      : {
          id: student.id,
          firstName: student.firstName,
          preferredName: student.preferredName,
        },
  );
});
router.post("/students", requireParent, async (req, res): Promise<void> => {
  const {
    firstName,
    lastName,
    preferredName,
    age,
    gradeLevel,
    learningStyle,
    interests,
    supportNotes,
  } = req.body;
  if (!String(firstName ?? "").trim() || !String(lastName ?? "").trim()) {
    res.status(400).json({ error: "First and last name are required" });
    return;
  }
  const parsedAge = Number(age);
  if (
    !Number.isInteger(parsedAge) ||
    parsedAge < 3 ||
    parsedAge > 21 ||
    !gradeLevel ||
    !learningStyle
  ) {
    res
      .status(400)
      .json({ error: "Age, grade level, and learning style are required" });
    return;
  }
  const [student] = await db
    .insert(studentsTable)
    .values({
      id: nanoid(),
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      preferredName: String(preferredName ?? "").trim() || null,
      age: parsedAge,
      gradeLevel: String(gradeLevel),
      learningStyle: String(learningStyle),
      interests: String(interests ?? "").trim() || null,
      supportNotes: String(supportNotes ?? "").trim() || null,
      ownerId: principal(res).ownerId,
    })
    .returning();
  res.status(201).json(student);
});
export default router;
