import { Router } from "express";
import { db, studentsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { DEMO_USER_ID, ensureDemoUser } from "../lib/user";
const router = Router();
router.get("/students", async (_req, res): Promise<void> => { await ensureDemoUser(); res.json(await db.select().from(studentsTable).where(eq(studentsTable.ownerId, DEMO_USER_ID)).orderBy(desc(studentsTable.createdAt))); });
router.get("/students/:id", async (req, res): Promise<void> => { await ensureDemoUser(); const [student] = await db.select().from(studentsTable).where(and(eq(studentsTable.id, req.params.id), eq(studentsTable.ownerId, DEMO_USER_ID))); if (!student) { res.status(404).json({ error: "Student not found" }); return; } res.json(student); });
router.post("/students", async (req, res): Promise<void> => {
 await ensureDemoUser(); const { firstName, lastName, preferredName, age, gradeLevel, learningStyle, interests, supportNotes } = req.body;
 if (!String(firstName ?? "").trim() || !String(lastName ?? "").trim()) { res.status(400).json({ error: "First and last name are required" }); return; }
 const parsedAge = Number(age); if (!Number.isInteger(parsedAge) || parsedAge < 3 || parsedAge > 21 || !gradeLevel || !learningStyle) { res.status(400).json({ error: "Age, grade level, and learning style are required" }); return; }
 const [student] = await db.insert(studentsTable).values({ id: nanoid(), firstName: String(firstName).trim(), lastName: String(lastName).trim(), preferredName: String(preferredName ?? "").trim() || null, age: parsedAge, gradeLevel: String(gradeLevel), learningStyle: String(learningStyle), interests: String(interests ?? "").trim() || null, supportNotes: String(supportNotes ?? "").trim() || null, ownerId: DEMO_USER_ID }).returning(); res.status(201).json(student);
});
export default router;
