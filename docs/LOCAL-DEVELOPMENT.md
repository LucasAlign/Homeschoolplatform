# Local synthetic development

Node 24 and pnpm 10 are used. If pnpm is not on PATH, prefix commands with `npx --yes pnpm@10.28.2` instead of `pnpm`. Windows x64 native build packages are now allowed; dependency minimum-release-age protection remains unchanged.

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm test
pnpm --filter @workspace/api-server exec tsx tests/browser-smoke.ts
```

The browser smoke command runs **after `pnpm test`**. It launches the real API with an ephemeral PGlite adapter, Vite on a loopback-only random port, and headless Edge. It creates fictional learners, creates an assignment through the UI, uploads a synthetic PNG, approves work, verifies a downloaded portfolio, switches children, and checks mobile overflow. It closes its servers/browser and discards the database. Set `BROWSER_CHANNEL=chrome` for installed Chrome. Screenshots are in `artifacts/api-server/.test-build/`; this directory is ignored. No external requests are allowed by the browser harness.

The workspace includes an unrelated mockup package that requires PORT and BASE_PATH even during builds. In PowerShell:

```powershell
$env:PORT='3000'
$env:BASE_PATH='/'
pnpm run build
```

## Persistent local preview (optional)

No persistent DB was provisioned during this task. Docker Desktop was not running. The automated tests need neither Docker nor a network DB. If you already have a dedicated empty local PostgreSQL database, use **only synthetic data** and a database name `homeschool_synthetic` or `homeschool_synthetic_<lowercasealphanumerics>` on `127.0.0.1`.

Set `DATABASE_URL=postgresql://<local-user>:<local-password>@127.0.0.1:5432/homeschool_synthetic` for the DB tooling and apply the checked-in initial migration only to that new empty DB (`pnpm --filter @workspace/db exec drizzle-kit migrate`). Do not use production credentials, a real family DB, or URL query options. For schema changes, review generated SQL before applying it.

Create ignored `artifacts/api-server/.env.local`:

```dotenv
NODE_ENV=development
SYNTHETIC_DATA_ONLY=true
DATABASE_URL=postgresql://<local-user>:<local-password>@127.0.0.1:5432/homeschool_synthetic
PORT=5000
```

Run `pnpm --filter @workspace/api-server run dev` and, in another terminal with PORT unset or set to 3000, `pnpm --filter @workspace/homeschool run dev`. Open `http://127.0.0.1:3000/work`. The API dev script loads its `.env.local` cross-platform; never commit credentials. The production start command does not enable synthetic mode automatically. Missing authentication returns a truthful unavailable message.

## Verification record (2026-11-08)

Original main was independently checked in a detached `../baseline` worktree. Locked dependency installation reached the Unix-only preinstall command and failed on Windows (`sh` unavailable). Installing baseline dependencies with lifecycle scripts skipped allowed its full typecheck to pass. Its build failed on the excluded `@rollup/rollup-win32-x64-msvc` package. No baseline automated test suite was configured for the active app.

The implementation fixes the preinstall portability, restores Windows x64 build packages, normalizes Drizzle's schema path on Windows, and aligns the generated Zod library with Orval's Zod 4 output. Full build requires the mockup environment shown above. A non-fatal pre-existing tooltip sourcemap diagnostic remains during Vite build.

Final verification passed:

- OpenAPI/Orval code generation and generated-library typecheck.
- `pnpm test`: 5 tests passed, 0 failed. Includes configuration fail-closed checks, hostile Host/Origin and cross-site requests, body-size limits, invalid dates/links/images, all four curriculum sources, cross-child and foreign-family access denial, concurrent duplicate submission rejection, stale review rejection, revision history, and parent overrides.
- Headless Edge browser smoke: created assignment through the UI, uploaded and rendered a synthetic PNG, submitted work, approved it with score/feedback, parsed the downloaded year portfolio and verified its evidence/review records, switched to another child with no leaked assignments, and checked desktop/mobile layouts with no page exceptions or horizontal mobile overflow. Desktop and mobile screenshots were visually inspected.
- Full workspace typecheck and build with `PORT=3000`, `BASE_PATH=/`.
- `git diff --check`.

Not run: real PostgreSQL/network-driver integration (Docker daemon unavailable), real-family login/authorization (not implemented), external AI calls (intentionally disabled), production migration, deployment, push, or merge. PGlite tests apply the checked-in migration to a fresh ephemeral database. These checks do not authorize production use.
