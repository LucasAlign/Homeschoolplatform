# Homeschool Platform

A curriculum-first homeschool platform for **parents/educators** and their **students**.
Parents build courses, organize them into units, and author lessons; students will
work through published lessons in a later phase.

Built with **Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Prisma 6 (SQLite)**.

See [ROADMAP.md](./ROADMAP.md) for the full phased plan.

## Status

- ✅ **Phase 0 — Foundation**: app shell, nav, DB layer.
- 🚧 **Phase 1 — Curriculum & Lessons (MVP)**: Courses → Units → Lessons CRUD,
  publish/draft, lesson editor. _(current)_
- ⬜ Phase 2+ — Students, delivery, scheduling, grading, records. See roadmap.

## Getting started

```bash
npm install
npm run db:push     # create the SQLite dev database from the Prisma schema
npm run db:seed     # load sample courses (optional)
npm run dev         # http://localhost:3000
```

There is no auth yet (Phase 8). Every request runs as a single seeded
"Demo Parent" — see `src/lib/user.ts`.

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run db:push` | Sync the Prisma schema to `prisma/dev.db` |
| `npm run db:seed` | Load sample curriculum |
| `npm run db:studio` | Open Prisma Studio |
| `npm run lint` | ESLint |

## Project layout

```
prisma/
  schema.prisma        # User, Course, Unit, Lesson models
  seed.ts              # sample data
src/
  lib/db.ts            # shared PrismaClient
  lib/user.ts          # current-user shim (until auth in Phase 8)
  app/
    actions.ts         # server actions (course/unit/lesson CRUD)
    page.tsx           # dashboard
    courses/           # course list, create, detail, edit, lesson editor
```

## Data model

`User → Course → Unit → Lesson`. Courses and lessons each have a `published`
flag (draft vs. published). Ordering is tracked with an `order` field on units
and lessons.
