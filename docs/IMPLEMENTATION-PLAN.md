# AnchorOne: child work foundation

Current continuation: verified family/child sessions, authenticated evidence retrieval and retry-safe recurring lessons are implemented for local synthetic use. See [authorization design and release blockers](AUTHORIZATION-DESIGN.md). The phase-1 snapshot below records the previous commit's scope; it must not be read as the current authentication implementation.

## Baseline inspected

Work starts at `164a964e22255f4ca1a2d91e5d5b515ad8a2fbfb` (main). The active app is React/Vite in `artifacts/homeschool`, Express in `artifacts/api-server`, Drizzle/PostgreSQL in `lib/db`, and Orval contracts in `lib/api-spec`. `.migration-backup` is historical Next.js code, not the active implementation. No applicable AGENTS.md exists outside that backup. The referenced pnpm-workspace skill was not present locally; replit.md supplied the workspace commands.

The existing app creates students and parent-owned courses/units/lessons. Curriculum setup writes the learner's name into a course description, without a real child-course relationship. There were no daily assignments, evidence records, review workflow, or year portfolios. The shared demo parent was not authentication; some lesson/unit writes bypassed even its ownership checks.

The separate existing checkout at `C:/Users/LucasSystemMobile/homeschool platform/Homeschoolplatform` is on `firebase-mvp-foundation` with unrelated edits. It was left untouched. This isolated checkout uses `codex/child-work-foundation`. No push, merge, deployment, live DB, account settings, or external AI calls are part of this work.

## Phase 1 snapshot (commit 1682ae6)

- All data routes fail closed with 503 until explicitly configured for local synthetic data. Production mode remains blocked. The health route alone stays public. API and Vite bind to loopback; Vite proxies `/api` locally. Requests reject foreign Host/Origin, cross-site browser requests, non-loopback peers, remote database URLs, and database URL query overrides.
- This is **not family authentication**. There is no trusted demo-user header, provider selection, real child login, or parent/student role enforcement. `demo-parent` exists only behind the synthetic boundary. All UI pages disclose this limitation. Never enable this mode on an existing family database, reverse proxy, tunnel, or public host.
- Daily Work at `/work` chooses a child and shows due/overdue work, awaiting review, or all history. A parent can record any textbook, offline, website, or custom curriculum using a named resource, subject, date, school-year label, instructions, optional HTTP(S) link, and rubric/answer key.
- Notes and up to two PNG/JPEG sample images (1 MiB each) create an immutable submission attempt. Raster signatures and base64 are validated; SVG and remote evidence fetching are rejected. The assignment transitions assigned → submitted → approved/needs_revision. Row locks prevent double submissions. Stale reviews of older attempts are rejected. Parent corrections append reviews and preserve history.
- Year export downloads JSON containing all selected-year assignments, statuses, images, attempts, and reviews, including unfinished work. This is a portable first portfolio record, not a polished transcript/PDF or jurisdictional compliance report.
- AI status is explicitly unavailable. No provider call, inferred grade, OCR, or fabricated feedback is produced. Rubrics support manual parent review now.
- The new API paths are specified in `lib/api-spec/work.openapi.json`, referenced by `openapi.yaml`, with generated client/Zod output. Runtime validation adds calendar-date, evidence-signature, nonempty-submission, and workflow checks beyond the structural contract.

## Next phases and acceptance gates

1. **Real family authorization (release blocker):** select an identity provider with the user, validate server-side sessions, model family membership and parent/student roles, derive identity only from verified sessions, remove the shared demo identity from real requests, and prove cross-family isolation for every route and storage object. Children must not see answer keys or review controls. Add CSRF/session protections and audit events. Keep production data routes disabled until this is reviewed.
2. **Curriculum planning:** explicit child enrollments in existing courses, import/manual curriculum references, reusable schedules, rescheduling, holidays, assignment editing/cancellation, attendance, and correction audit trails. Preserve existing course/lesson authoring; do not replace it.
3. **Private evidence storage:** private object storage, authenticated retrieval, quotas, image decoding/re-encoding and metadata removal, malware/content handling, retention/deletion policy, backups, and pagination. Current JSONB images and full-history responses are bounded per submission but not scalable across a year. Signature checking alone is not full image validation. Only synthetic fixtures are allowed in this phase.
4. **Grounded AI drafts:** configure provider and explicit data-sharing consent; keep secrets server-side; use selected rubric/answer key and reviewed evidence; treat text in uploads as untrusted; return draft feedback with grounding, uncertainty and unavailable/failure states; require parent acceptance/override. Test with synthetic fixtures before considering real data. Never automatically finalize grades.
5. **Year-end compilation:** printable/downloadable PDF/ZIP, selected academic-date ranges, subject summaries, grade policies, export integrity checks and restore/import. Confirm regional recordkeeping needs rather than claiming compliance.

## Remaining implementation limitations after the continuation

Verified parent/child credentials and server-enforced role boundaries now exist, including child-specific UI and private evidence retrieval. Production remains intentionally blocked pending the release steps in AUTHORIZATION-DESIGN.md. Existing curriculum onboarding still makes generic draft courses; daily assignments record their curriculum independently. Recurring creation is implemented, but enrollment links, assignment editing/rescheduling, deleting child work, pagination, persistent export jobs, and AI grading remain deferred.

The generated initial migration creates the entire schema for a **fresh empty synthetic database**. Do not apply it blindly to an existing database that was initialized using `drizzle-kit push`. A separately reviewed baseline/adoption migration is needed before any existing deployment is upgraded. Tests use an isolated in-memory PostgreSQL-compatible PGlite engine and do not prove node-postgres networking, multi-process locking, or backup behavior on a live PostgreSQL server.
