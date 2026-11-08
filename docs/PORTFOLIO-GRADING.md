# Parent portfolios and grading drafts

This continuation remains local and synthetic only. Verified family sessions and child authorization protect every new endpoint. Production access remains blocked. No external provider, real student record or deployment was used.

## Printable year portfolio

In Daily Work, parents open **Build printable year portfolio**, choose a school-year label and up to 30 assignments, then choose photos, parent feedback/scores and all attempts/reviews. The default includes the latest attempt and latest review. The preview includes a cover, subject list, status counts, contents, instructions, evidence and review provenance. **Print / Save as PDF** waits for image decoding before opening the browser print dialog. A4 styling hides navigation and starts each assignment on a new page.

The server accepts only selected work belonging to that child and year. The preview excludes surnames, private support notes, answer keys, rubric snapshots and unreviewed drafts. Submitted text and parent feedback are included as entered: inspect them before sharing. Responses are authenticated and no-store; no public export URL is created. Saved PDFs are parent-controlled files outside session revocation. The separate legacy full JSON year export contains broader profile/rubric/history fields.

Selections over 12 MiB return an error asking parents to reduce the selection or omit images. This is a bounded print packet, not an unlimited archive, certified transcript or legal compliance determination. School years are assignment labels, not inferred date ranges. Browser pagination can vary with long text or images; inspect the print preview.

## Grounded test drafts

Default grading is unavailable. Optionally set `GRADING_PROVIDER=synthetic` in the ignored local configuration with the existing synthetic-only guards. No configuration value enables an external provider. The deterministic provider is **not AI**:

- A single-line `Answer key: Five` compares normalized typed text literally, yielding a clearly simulated 100 or 0 suggestion. It cannot evaluate reasoning or equivalent answers.
- Other rubrics produce linked source excerpts without a score or correctness assessment.
- Missing rubrics and image-only work remain unavailable. Images and child identities are not passed to the provider interface.

Attempts persist status, source hash, rubric snapshot, provider, actor and time. Output validation requires bounded feedback, an optional 0–100 score and quotations actually present in both supplied sources. Invalid output, exceptions and timeouts produce failure without a grade. The injectable provider interface supports synthetic tests only.

Generating a draft never changes assignment status or creates a review. Parents load a successful simulated draft, accept it unchanged, override it or clear it and review manually. Edits select override automatically; the server rejects edited feedback falsely marked accepted. Saving a decision is explicit. Linked reviews preserve simulation provenance even when feedback is replaced. New submissions or changed source hashes invalidate old drafts. Children cannot read/generate drafts or answer keys; they see saved parent feedback and its provenance.

## Remaining release work

1. Complete production identity, recovery, TLS/session and operational gates in [AUTHORIZATION-DESIGN.md](AUTHORIZATION-DESIGN.md). Local credentials exist, but public access remains blocked.
2. Review migration adoption for the target database. Migration 0003 adds draft audit records and nullable review provenance. Do not apply the initial migration blindly over an existing installation.
3. Validate real PostgreSQL/driver concurrency and backups; current tests use isolated PGlite. Add scalable private evidence storage, quotas, decoding/re-encoding, metadata removal, retention and pagination before accepting real photos.
4. Agree on an external provider and explicit parental sharing consent, payload, retention and revocation. Implement a separately reviewed adapter with prompt-injection defenses and uncertainty handling. Literal-match test scores must never become real grading. No provider or consent integration exists.
5. Add large asynchronous PDF/ZIP archives, date ranges, grading policies, export integrity and restore. Confirm actual family recordkeeping needs.

## Verification

Run `pnpm test` before browser scripts to compile the isolated test API. Then run `pnpm --filter @workspace/api-server exec tsx tests/browser-portfolio.ts`. It uses headless Edge, fictional accounts and sample PNG bytes, blocks external browser requests, and checks child submission, parent draft/override, selection privacy, image readiness, print action, PDF generation and mobile overflow. Generated screenshots/PDF stay ignored in `artifacts/api-server/.test-build`.
