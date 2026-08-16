import { pgTable, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";

export const lessonsTable = pgTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    order: integer("order").notNull().default(0),
    published: boolean("published").notNull().default(false),
    unitId: text("unit_id")
      .notNull()
      .references(() => unitsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("lessons_unit_idx").on(t.unitId)],
);

export const insertLessonSchema = createInsertSchema(lessonsTable).omit({ createdAt: true, updatedAt: true });
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type Lesson = typeof lessonsTable.$inferSelect;
