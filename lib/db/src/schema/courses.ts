import { pgTable, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const coursesTable = pgTable(
  "courses",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    subject: text("subject"),
    gradeLevel: text("grade_level"),
    published: boolean("published").notNull().default(false),
    ownerId: text("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("courses_owner_idx").on(t.ownerId)],
);

export const insertCourseSchema = createInsertSchema(coursesTable).omit({ createdAt: true, updatedAt: true });
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof coursesTable.$inferSelect;
