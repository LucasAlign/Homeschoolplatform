import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
export const studentsTable = pgTable("students", {
 id: text("id").primaryKey(), firstName: text("first_name").notNull(), lastName: text("last_name").notNull(), preferredName: text("preferred_name"),
 age: integer("age").notNull(), gradeLevel: text("grade_level").notNull(), learningStyle: text("learning_style").notNull(), interests: text("interests"), supportNotes: text("support_notes"),
 ownerId: text("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
 updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("students_owner_idx").on(t.ownerId)]);
export const insertStudentSchema = createInsertSchema(studentsTable).omit({ createdAt: true, updatedAt: true });
export type InsertStudent = z.infer<typeof insertStudentSchema>;
export type Student = typeof studentsTable.$inferSelect;
