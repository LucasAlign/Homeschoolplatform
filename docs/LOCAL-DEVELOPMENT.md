# Local synthetic development

## Portfolio/grading continuation verification (2026-11-08)

- `pnpm test`: 11 passed, 0 failed. New coverage includes parent-only portfolio/draft access, foreign-family and wrong-year selection denial, private-field exclusion, selection bounds, optional evidence/review history, unchanged assignment status after generation, accepted-vs-overridden reviews, stale submissions/rubrics, disabled providers, image-only unavailability, grounded citations, invalid output and timeout handling.
- Full workspace build (including typecheck) passed with `PORT=3000` and `BASE_PATH=/`. The existing nonfatal tooltip sourcemap warning remains.
- All three Edge browser scripts passed: `browser-smoke.ts`, `browser-family.ts`, and `browser-portfolio.ts`. The new flow verifies child photo submission, grounded synthetic draft generation, explicit parent override, selected-year preview privacy, image readiness before print, PDF generation and mobile overflow, with no page exceptions.
- Print-media and mobile screenshots were visually inspected. The generated PDF was confirmed as two A4 pages with `pdfinfo`; both pages were rasterized with `pdftoppm` and visually inspected for margins, page breaks and visible review provenance. The sample image is intentionally a one-pixel PNG fixture, not a real child's photo.
- `git diff --check` passed. The two initial new-browser failures were test selectors assuming ASCII hyphens where UI labels use typographic dashes; selectors were corrected and the complete flow rerun successfully.

No external AI calls, real PostgreSQL/network-driver test, production migration, deployment, push or merge was performed. PGlite databases and browser servers are ephemeral and closed by the test harness. See [current scope and release blockers](PORTFOLIO-GRADING.md).

Node 24 and pnpm 10 are used. If pnpm is not on PATH, prefix commands with `npx --yes pnpm@10.28.2` instead of `pnpm`. Windows x64 native build packages are now allowed; dependency minimum-release-age protection remains unchanged.

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm test
pnpm --filter @workspace/api-server exec tsx tests/browser-smoke.ts
pnpm --filter @workspace/api-server exec tsx tests/browser-family.ts
pnpm --filter @workspace/api-server exec tsx tests/browser-portfolio.ts
```

The browser smoke command runs **after `pnpm test`**. It launches the real API with an ephemeral PGlite adapter, Vite on a loopback-only random port, and headless Edge. It creates fictional learners, creates an assignment through the UI, uploads a synthetic PNG, approves work, verifies a downloaded portfolio, switches children, and checks mobile overflow. It closes its servers/browser and discards the database. Set `BROWSER_CHANNEL=chrome` for installed Chrome. Screenshots are in `artifacts/api-server/.test-build/`; this directory is ignored. No external requests are allowed by the browser harness.

The workspace includes an unrelated mockup package that requires PORT and BASE_PATH even during builds. In PowerShell:

```powershell
$env:PORT='3000'
$env:BASE_PATH='/'
pnpm run build
```

## Persistent local preview (optional)

See [portfolio and grading workflow](PORTFOLIO-GRADING.md) for printable selections and optional `GRADING_PROVIDER=synthetic`. External AI remains disabled for every configuration.

No persistent DB was provisioned during this task. Docker Desktop was not running. The automated tests need neither Docker nor a network DB. If you already have a dedicated empty local PostgreSQL database, use **only synthetic data** and a database name `homeschool_synthetic` or `homeschool_synthetic_<lowercasealphanumerics>` on `127.0.0.1`.

Set `DATABASE_URL=postgresql://<local-user>:<local-password>@127.0.0.1:5432/homeschool_synthetic` for the DB tooling and apply the checked-in initial migration only to that new empty DB (`pnpm --filter @workspace/db exec drizzle-kit migrate`). Do not use production credentials, a real family DB, or URL query options. For schema changes, review generated SQL before applying it.

Create ignored `artifacts/api-server/.env.local`:

```dotenv
NODE_ENV=development
SYNTHETIC_DATA_ONLY=true
AUTH_MODE=family
LOCAL_FAMILY_SIGNUP=true
LOCAL_APP_ORIGIN=http://127.0.0.1:3000
DATABASE_URL=postgresql://<local-user>:<local-password>@127.0.0.1:5432/homeschool_synthetic
PORT=5000
```

Run `pnpm --filter @workspace/api-server run dev` and, in another terminal with PORT unset or set to 3000, `pnpm --filter @workspace/homeschool run dev`. Open the exact configured `http://127.0.0.1:3000/work` origin. Create a fictional family account, sign in, add fictional children and create their logins from Daily Work. Parents can schedule repeated lessons, children can submit their own work, and parents can review and export. Use passwords of at least 15 characters. The API dev script loads its `.env.local` cross-platform; never commit credentials. Set `LOCAL_FAMILY_SIGNUP=false` after creating local fixture families if desired. `AUTH_MODE=synthetic` is the explicit old demo mode; missing or unknown modes fail closed. Both modes still require the synthetic database gate. The production start command does not enable either mode automatically.

`browser-family.ts` exercises real signup/login cookies, child credentials, recurring lessons, role-filtered UI, child submission, parent review, password change and cross-tab clearing against a fresh ephemeral database. It sets an exact random local frontend origin for the test only. See [authorization design](AUTHORIZATION-DESIGN.md) for the production blockers and limitations.

## Phase-1 verification record (2026-11-08, commit 1682ae6)

Original main was independently checked in a detached `../baseline` worktree. Locked dependency installation reached the Unix-only preinstall command and failed on Windows (`sh` unavailable). Installing baseline dependencies with lifecycle scripts skipped allowed its full typecheck to pass. Its build failed on the excluded `@rollup/rollup-win32-x64-msvc` package. No baseline automated test suite was configured for the active app.

The implementation fixes the preinstall portability, restores Windows x64 build packages, normalizes Drizzle's schema path on Windows, and aligns the generated Zod library with Orval's Zod 4 output. Full build requires the mockup environment shown above. A non-fatal pre-existing tooltip sourcemap diagnostic remains during Vite build.

Final verification passed:

- OpenAPI/Orval code generation and generated-library typecheck.
- `pnpm test`: 5 tests passed, 0 failed. Includes configuration fail-closed checks, hostile Host/Origin and cross-site requests, body-size limits, invalid dates/links/images, all four curriculum sources, cross-child and foreign-family access denial, concurrent duplicate submission rejection, stale review rejection, revision history, and parent overrides.
- Headless Edge browser smoke: created assignment through the UI, uploaded and rendered a synthetic PNG, submitted work, approved it with score/feedback, parsed the downloaded year portfolio and verified its evidence/review records, switched to another child with no leaked assignments, and checked desktop/mobile layouts with no page exceptions or horizontal mobile overflow. Desktop and mobile screenshots were visually inspected.
- Full workspace typecheck and build with `PORT=3000`, `BASE_PATH=/`.
- `git diff --check`.

Not run: real PostgreSQL/network-driver integration (Docker daemon unavailable), real-family login/authorization (not implemented), external AI calls (intentionally disabled), production migration, deployment, push, or merge. PGlite tests apply the checked-in migration to a fresh ephemeral database. These checks do not authorize production use.

## Continuation verification (2026-11-08)

Verified local credential authentication and family/child authorization are now implemented. Final checks on this continuation:

- OpenAPI/Orval code generation and generated-library typecheck passed, including auth, private evidence, portfolio and recurring schedule contracts.
- `pnpm test`: **7 passed, 0 failed**. The expanded family case exercises two parents in separate families, a child account, every legacy ownership chain, hidden answer keys/support notes, blocked child review/export/account creation, CSRF, spoofed identity headers, hostile login origin, password hashing, cookie flags, hashed session storage, rotation, logout, absolute/idle expiry, password revocation, throttling, authenticated image access and denial after logout. Scheduling checks cover weekday/holiday dates, identical retry IDs, conflicting retries, invalid limits and leap-day/calendar bounds. Prior evidence/review/revision tests still pass.
- `browser-smoke.ts` passed: assignment, PNG upload/render, parent review, actual portfolio download/content verification, child selector isolation and desktop/mobile layout.
- `browser-family.ts` passed: UI family registration and cookie login, child credential creation, three recurring lessons, child-specific UI without parent controls/answer keys, child submission, parent approval, logout/account switching, password change and cross-tab clearing, mobile overflow check, no page exceptions. The family-child screenshot was visually inspected.
- Full workspace typecheck and build passed with `PORT=3000` and `BASE_PATH=/`; the existing non-fatal tooltip sourcemap diagnostic remains.
- `git diff --check` passed.

Not run: network PostgreSQL/multi-process validation, production identity/recovery setup, private object-storage operations, external AI calls, production migrations or deployment. No real child data, provider account or live settings were used. Browser servers and ephemeral databases were closed after tests. See AUTHORIZATION-DESIGN.md for the precise remaining release gates.
