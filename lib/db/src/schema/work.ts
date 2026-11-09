import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { studentsTable } from "./students";
export type Evidence = { name: string; dataUrl: string };
export const scheduleBatchesTable = pgTable("schedule_batches", {
  key: text("key").primaryKey(),
  studentId: text("student_id")
    .notNull()
    .references(() => studentsTable.id, { onDelete: "restrict" }),
  fingerprint: text("fingerprint").notNull(),
  assignmentIds: jsonb("assignment_ids").$type<string[]>().notNull(),
});
export const assignmentsTable = pgTable(
  "assignments",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => studentsTable.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    curriculum: text("curriculum").notNull(),
    sourceType: text("source_type").notNull(),
    instructions: text("instructions").notNull(),
    resourceUrl: text("resource_url"),
    dueDate: text("due_date").notNull(),
    schoolYear: text("school_year").notNull(),
    rubric: text("rubric").notNull(),
    status: text("status").notNull().default("assigned"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("assignments_student_due_idx").on(t.studentId, t.dueDate)],
);
// Attempts and reviews are append-only so revisions preserve evidence.
export const submissionsTable = pgTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignmentsTable.id, { onDelete: "restrict" }),
    notes: text("notes").notNull(),
    evidence: jsonb("evidence").$type<Evidence[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("submissions_assignment_idx").on(t.assignmentId)],
);
export type GradingGrounding = {
  rubricQuote: string;
  evidenceQuote: string;
  explanation: string;
};
export const gradingDraftsTable = pgTable(
  "grading_drafts",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissionsTable.id, { onDelete: "restrict" }),
    sourceHash: text("source_hash").notNull(),
    rubricSnapshot: text("rubric_snapshot").notNull(),
    provider: text("provider"),
    status: text("status").notNull(),
    simulated: boolean("simulated").notNull().default(true),
    feedback: text("feedback"),
    score: integer("score"),
    grounding: jsonb("grounding").$type<GradingGrounding[]>().notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("grading_submission_idx").on(t.submissionId)],
);
export const reviewsTable = pgTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissionsTable.id, { onDelete: "restrict" }),
    decision: text("decision").notNull(),
    feedback: text("feedback").notNull(),
    score: integer("score"),
    reviewerId: text("reviewer_id").notNull(),
    gradingDraftId: text("grading_draft_id").references(
      () => gradingDraftsTable.id,
      { onDelete: "restrict" },
    ),
    draftAction: text("draft_action"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("reviews_submission_idx").on(t.submissionId)],
);
