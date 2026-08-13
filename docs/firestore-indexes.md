# Firestore composite indexes

`firestore.indexes.json` (wired into `firebase.json`) declares the composite
indexes the server queries need. Firestore auto-creates **single-field** indexes;
composite indexes are required only for queries that combine multiple fields.

## Rule of thumb
A query needs a composite index when it has **either**:
- an `orderBy` on a field other than a single equality-filtered field, **or**
- equality filters on multiple fields (a merge across single-field indexes is
  fragile; declare the composite so behavior is deterministic).

Single equality filter with no cross-field `orderBy` → **no composite index** (auto).

## Current indexes (derived from real queries)

| Collection | Query (source) | Index |
|-----------|----------------|-------|
| `officialGrades` | `where(assignmentId ==) · where(studentId ==) · orderBy(version desc)` — `assessment/grading.ts` `currentGrade` (latest grade in the supersession chain) | `assignmentId ASC, studentId ASC, version DESC` |
| `masteryRecords` | `where(studentId ==) · where(skillId ==) · where(state == 'Confirmed')` — `mastery/mastery.ts` `currentConfirmed` | `studentId ASC, skillId ASC, state ASC` |

## Auto-indexed (no composite) — for the record
`supportEvents` by `submissionId`, `notifications` by `tier`, `evidence` by
`submissionId`, `remediationDrafts` by `sourceAssessmentId` — all single-equality.

## Adding an index
When a new multi-field query lands, add its entry here and to
`firestore.indexes.json`. Deploy with `firebase deploy --only firestore:indexes`,
or let the emulator/console surface the exact index from the FAILED_PRECONDITION
error link during development. The queryScope is `COLLECTION` (these are
per-Household subcollections queried directly, not via `collectionGroup`).
