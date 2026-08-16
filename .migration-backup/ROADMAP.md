# Homeschool Platform — Build Roadmap

A curriculum-first homeschool platform for **parents/educators** and their **students**.
Built with Next.js (App Router) + TypeScript + Tailwind + Prisma.

## Phases

| Phase | Name | Ships | Status |
|-------|------|-------|--------|
| **0** | Foundation | Next.js + TS + Tailwind, Prisma + SQLite, app shell, DB client | ✅ Done |
| **1** | Curriculum & Lessons *(MVP)* | Courses → Units → Lessons CRUD, rich content, ordering, publish/draft | 🚧 In progress |
| **2** | Students & Enrollment | Student profiles under a parent, enroll students in courses | ⬜ Planned |
| **3** | Lesson Delivery & Progress | Student lesson view, mark complete, % progress per course | ⬜ Planned |
| **4** | Planning & Scheduling | Weekly planner, calendar, assignment due dates | ⬜ Planned |
| **5** | Assessments & Grading | Quizzes/assignments, grades, mastery tracking | ⬜ Planned |
| **6** | Records & Reporting | Attendance, transcripts, printable compliance reports | ⬜ Planned |
| **7** | Content Library | Browse/search/reuse shared resources & templates | ⬜ Planned |
| **8** | Polish & Launch | Auth/multi-family, payments, deploy, perf, a11y | ⬜ Planned |

## Domain model (current)

- **User** — a parent/educator account (auth added in Phase 8; single seed user for now).
- **Course** — a subject/class owned by a user. Has a title, description, grade level, publish status.
- **Unit** — an ordered section within a course.
- **Lesson** — an ordered lesson within a unit, with rich text content and publish status.
- **Student** — added Phase 2.
- **Enrollment / Progress** — added Phase 2–3.

## Local development

```bash
npm run dev          # start the app on http://localhost:3000
npm run db:push      # sync Prisma schema to the SQLite dev DB
npm run db:seed      # load sample curriculum
npm run db:studio    # open Prisma Studio
```

The dev database is SQLite (`prisma/dev.db`), zero-config. Swap the `datasource`
to Postgres for production in Phase 8.
