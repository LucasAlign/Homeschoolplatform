import {
  pgTable,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { studentsTable } from "./students";

export const familiesTable = pgTable("families", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "restrict" }),
});
export const membersTable = pgTable(
  "family_members",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    familyId: text("family_id")
      .notNull()
      .references(() => familiesTable.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    studentId: text("student_id").references(() => studentsTable.id, {
      onDelete: "restrict",
    }),
  },
  (t) => [
    index("members_family_idx").on(t.familyId),
    uniqueIndex("members_student_idx").on(t.studentId),
    check(
      "member_role_check",
      sql`(${t.role} = 'parent' AND ${t.studentId} IS NULL) OR (${t.role} = 'student' AND ${t.studentId} IS NOT NULL)`,
    ),
  ],
);
export const credentialsTable = pgTable("credentials", {
  userId: text("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});
export const sessionsTable = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
export const loginLimitsTable = pgTable("login_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});
