// Module H — Portfolio Snapshot content assembly + the answer-key / adult-content
// exclusion filter + reopen supersession (pure logic, unit-tested).
// docs/mvp-specification.md §11, §17 (invariants 2, 5).
//
// A snapshot is a SELF-CONTAINED, immutable copy bound to ONE Student + year. The
// exclusion filter is non-negotiable (invariant 2): answer keys / teacher guides
// NEVER appear; verbatim tutor transcripts are summarized only; an AI Assessment
// appears ONLY as advisory-labeled context, never as a standalone grade. Adult
// selection gates the discretionary content: Evidence/photos enter only when the
// parent SELECTED them, Official Grades only when parent-APPROVED (invariant 4).
// Reopen mirrors the Official Grade immutable-via-supersession idiom (invariant 5).

import {
  SNAPSHOT_EXCLUDED_CLASSES,
  SNAPSHOT_INCLUDED_CLASSES,
  type ExcludedItem,
  type PriorSnapshotRef,
  type SnapshotAssembly,
  type SnapshotChain,
  type SnapshotContentItem,
  type SnapshotItemClass,
  type SnapshotSourceItem,
} from './types';

const EXCLUDED = new Set<SnapshotItemClass>(SNAPSHOT_EXCLUDED_CLASSES);
const INCLUDED = new Set<SnapshotItemClass>(SNAPSHOT_INCLUDED_CLASSES);

/**
 * Answer-key / teacher-guide material may NEVER enter a snapshot (invariant 2).
 * A distinct, always-true guard so the rule reads explicitly at the call site and
 * a test can assert it directly.
 */
export function isAnswerKeyMaterial(itemClass: SnapshotItemClass): boolean {
  return itemClass === 'answer_key' || itemClass === 'teacher_guide';
}

/** Whether a class is excluded from a snapshot BY RULE (invariant 2, §11). */
export function isExcludedByRule(itemClass: SnapshotItemClass): boolean {
  return EXCLUDED.has(itemClass);
}

/**
 * Decide whether one source item belongs in the self-contained copy. Returns the
 * frozen content item, or a content-free exclusion reason. The order matters:
 * rule-excluded classes are rejected FIRST (they can never be overridden by a
 * selection flag), then the adult-selection gates apply.
 */
function classifyItem(
  item: SnapshotSourceItem,
  targetStudentId: string,
): { include: SnapshotContentItem } | { exclude: ExcludedItem } {
  const reject = (reason: string): { exclude: ExcludedItem } => ({
    exclude: { id: item.id, itemClass: item.itemClass, reason },
  });

  // Household/Student isolation: a snapshot is bound to ONE Student (invariant 1).
  if (item.studentId !== targetStudentId) {
    return reject('cross-student item (snapshot is bound to one student)');
  }

  // Invariant 2 + the summarize-only / no-standalone-AI-grade rules — never
  // overridable by any selection flag.
  if (isAnswerKeyMaterial(item.itemClass)) {
    return reject('answer-key / teacher-guide material is excluded (invariant 2)');
  }
  if (item.itemClass === 'tutor_transcript_verbatim') {
    return reject('verbatim tutor transcript is excluded (summarized only)');
  }
  if (item.itemClass === 'ai_assessment_standalone_grade') {
    return reject('AI assessment may not appear as a standalone grade');
  }
  if (isExcludedByRule(item.itemClass)) {
    return reject('class excluded by rule');
  }

  // Adult-selection gates for the discretionary classes (invariant 4).
  if ((item.itemClass === 'evidence' || item.itemClass === 'photo') && !item.parentSelected) {
    return reject('evidence/photo not parent-selected');
  }
  if (item.itemClass === 'official_grade' && !item.parentApproved) {
    return reject('official grade not parent-approved');
  }
  if (item.itemClass === 'ai_assessment_context' && !item.advisoryLabeled) {
    return reject('AI assessment context must be advisory-labeled');
  }

  if (!INCLUDED.has(item.itemClass)) {
    // Unknown class: fail closed (do not leak into the immutable copy).
    return reject('unrecognized item class');
  }

  return {
    include: {
      id: item.id,
      itemClass: item.itemClass as SnapshotContentItem['itemClass'],
      ref: item.ref,
    },
  };
}

/**
 * Assemble the self-contained snapshot content from candidate source items,
 * applying the exclusion filter. Pure: returns the included copy plus the
 * content-free list of exclusions (retained for the audit / transparency).
 */
export function assembleSnapshotContent(
  items: SnapshotSourceItem[],
  targetStudentId: string,
): SnapshotAssembly {
  const included: SnapshotContentItem[] = [];
  const excluded: ExcludedItem[] = [];

  for (const item of items) {
    const result = classifyItem(item, targetStudentId);
    if ('include' in result) included.push(result.include);
    else excluded.push(result.exclude);
  }

  return { included, excluded };
}

/**
 * Defence-in-depth assertion that no answer-key / teacher-guide material survived
 * assembly. Assembly already excludes it; a completed snapshot writer calls this
 * before freezing the copy so a leak fails LOUDLY rather than silently.
 */
export function assertNoAnswerKeyLeakage(content: SnapshotContentItem[]): void {
  const leak = content.find((c) => isAnswerKeyMaterial(c.itemClass as SnapshotItemClass));
  if (leak) {
    throw new Error(`snapshot answer-key leak: item ${leak.id} (${leak.itemClass})`);
  }
}

/**
 * Next version + supersession pointer for a snapshot given the prior (null =
 * first). Mirrors Official Grade's `nextGradeChain` (invariant 5): a reopen never
 * mutates the Approved copy — it materializes a NEW draft that points back.
 */
export function nextSnapshotChain(prior: PriorSnapshotRef | null): SnapshotChain {
  return {
    version: (prior?.version ?? 0) + 1,
    supersedesSnapshotId: prior?.id ?? null,
  };
}
