# Verified family sessions, private evidence and scheduling

This phase extends the existing app and commit `1682ae6`. It implements working credential authentication and family/child authorization, but **does not enable production use or real child data**. The outer local/synthetic boundary remains mandatory for both modes and rejects `NODE_ENV=production`.

## Identity and ownership

`AUTH_MODE=family` requires a verified server session for every data route. Missing/unknown AUTH_MODE fails closed. The old demo is available only through the explicit `AUTH_MODE=synthetic` setting, still behind the local-only synthetic database restrictions. There is no fallback from a failed family login to the demo and no user/role header accepted as identity.

A family has a stable root `owner_id` referencing its initial parent. Existing courses and student profiles keep their owner columns, so existing authoring code is preserved. A separate membership connects each account to one family and a parent or student role. A student membership also references exactly one child; the server checks that child's owner against the family on every session lookup. A database constraint rejects impossible role/student combinations. Multiple-parent invitation and membership changes are not exposed in this phase.

Local registration creates a new user, family, parent membership and credential atomically. It requires both family mode and `LOCAL_FAMILY_SIGNUP=true`, and never adopts the old demo data. Usernames are normalized and unique; internal user email fields get non-deliverable generated `@accounts.invalid` addresses. There is no email verification or external identity provider claim. Parents can create one login for a child belonging to their own family; the body cannot choose a role or family. Password changes verify the current password and revoke all that user's sessions atomically.

## Session controls

- Versioned, randomly salted scrypt hashes: N=65536, r=8, p=2, 64-byte output. Passwords are 15–128 characters on creation/change. Unknown-user login performs the same derivation. At most four derivations run at once to bound resource usage.
- Random 256-bit session cookies; the database stores only SHA-256 token hashes. Tokens are accepted only from one correctly formed cookie. Login creates a fresh token and revokes the prior cookie; a credential-row lock prevents a password-change race from creating a session against an obsolete password hash.
- Eight-hour absolute and 30-minute idle expiry enforced server-side. Logout deletes the current session. Password changes use an expected-hash update and delete all user sessions. Cookie settings are HttpOnly, SameSite=Strict, Path=/api; Secure is configured for production, which remains blocked by the outer boundary. HTTP is used only on loopback for synthetic development.
- Mutations require a per-session CSRF token held only in UI memory. Signup/login also require `X-Requested-With: AnchorOne` and an Origin matching the configured `LOCAL_APP_ORIGIN`. No CORS permission is granted. The configured origin is used rather than trusting proxy-forwarded host headers.
- Database-backed 15-minute counters limit login attempts by username (8) and local peer (40); registration (10) and password attempts (8) also have limits. Responses do not distinguish missing usernames from wrong passwords. Cleanup/retention and deployment edge limits remain release work.
- UI caches and component state are cleared when identities change. Logout and password changes invalidate other tabs via BroadcastChannel; focus rechecks the session. Credentials and CSRF tokens are not stored in localStorage/sessionStorage. A generation counter prevents stale session responses from restoring a logged-out identity.

The implementation uses Node's built-in cryptography and existing Express/Drizzle dependencies, avoiding a provider or paid service selection. Design references: [Node crypto](https://nodejs.org/api/crypto.html) and [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). These references and tests are not a production security certification.

## Authorization matrix

| Action | Parent | Child |
|---|---|---|
| List/profile learners | Own family | Own minimal profile only |
| Course/unit/lesson authoring | Own family | Denied |
| View assignments | Own family's children | Own child only |
| View rubrics/answer keys and support notes | Own family | Omitted server-side |
| Create assignments and recurring schedules | Own family | Denied |
| Submit notes/images | Own family | Own child only |
| View previous evidence/reviews | Own family | Own child only |
| Review/override grades | Own family; reviewer is authenticated user | Denied |
| Download year portfolio | Own family | Denied |
| Create child login | Own family's child | Denied |
| Change own password/logout | Allowed | Allowed |

Foreign-family and sibling resources return 404 where the resource itself is concealed. Role-prohibited operations return 403. All legacy routes now derive ownership from the principal, not `demo-parent`.

## Private evidence

Dashboard responses contain evidence names and authenticated relative URLs, without embedded file bytes. The retrieval endpoint verifies session, family, child, assignment and submission before returning a bounded raster. It emits `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, a sandbox CSP and a fixed safe filename. There are no public object URLs or signed links to share. A parent-only, school-year-filtered portfolio endpoint includes data URLs for a self-contained download.

Bytes remain in PostgreSQL JSONB for this limited phase. Existing fixture records need no conversion. This is private application access, **not** a production media platform: full image decoding/re-encoding, EXIF removal, malware/content processing, quotas, encrypted storage/backups, deletion/retention and pagination are still required. Never upload real children's work during this phase.

## Scheduling

A parent can create 1–60 lessons with a start date, selected weekdays and up to 100 skipped dates. UTC calendar-date arithmetic avoids daylight-saving shifts. Each materialized assignment has independent evidence/review history; repeated lessons share the specified curriculum, instructions and rubric. Dates must fit within two years and the supported calendar range.

The bulk request carries a UUID. A transaction locks the child's row, creates assignments and records a fingerprint plus resulting IDs. An identical retry returns the same IDs; reuse with different content returns 409. The UI retains the request ID across retries and changes it when the form changes or succeeds. There is no background scheduling job, new service, or repeated delivery automation. Editing/rescheduling existing assignments and linking reusable course enrollments remain next-phase work.

## Precise release/setup blockers

1. Decide whether to retain local credentials or integrate a managed identity provider. No external account/provider has been configured. If managed identity is selected, implement and test its verified callback/token exchange into the same membership/session boundary; never accept a caller-provided user ID.
2. Define account recovery, parent invitations, MFA/passkeys, compromised-password handling, membership/session administration and security audit/retention. There is currently no forgotten-password recovery or child credential reset; do not deploy accounts that cannot be recovered operationally.
3. Review a separate production configuration and remove the production gate only in that reviewed implementation. Set canonical HTTPS origin, TLS/HSTS, Secure cookie behavior, explicit trusted proxy policy, database TLS/least-privilege, secret handling, session/counter cleanup and perimeter limits. Merely setting `AUTH_MODE=family` does **not** make production usable.
4. Validate against a dedicated network PostgreSQL test instance, including multi-process concurrency, migrations and rollback/backup recovery. This machine's Docker daemon is unavailable; PGlite tests do not certify those behaviors. Migrations 0001/0002 are additive after the checked-in 0000 baseline; an older deployment created with schema push needs a reviewed baseline-adoption plan.
5. Complete private-media lifecycle and real-data consent/retention policy. AI remains unavailable; no external AI requests or real child data were used. Provider and sharing consent must be configured and explicitly reviewed before grounded AI drafts are enabled.

No deployment, push, merge, live settings, identity-provider account, or production database change was performed.
