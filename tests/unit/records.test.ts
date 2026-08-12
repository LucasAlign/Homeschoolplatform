import { describe, expect, it } from 'vitest';
import {
  canTransitionYear,
  assertYearTransition,
  isTerminalYear,
  SchoolYearTransitionError,
  canTransitionSnapshot,
  assertSnapshotTransition,
  isTerminalSnapshot,
  SnapshotTransitionError,
} from '../../src/modules/records/school-year-state-machine';
import { evaluateCompletionPreconditions, isTerminalAssignment } from '../../src/modules/records/completion';
import {
  assembleSnapshotContent,
  assertNoAnswerKeyLeakage,
  isAnswerKeyMaterial,
  isExcludedByRule,
  nextSnapshotChain,
} from '../../src/modules/records/snapshot';
import type {
  AssignmentCompletionSummary,
  CompletionInput,
  SnapshotSourceItem,
} from '../../src/modules/records/types';

const graded = (id: string): AssignmentCompletionSummary => ({ assignmentId: id, status: 'graded' });
const ungraded = (id: string): AssignmentCompletionSummary => ({ assignmentId: id, status: 'submitted' });

const completeInput = (over: Partial<CompletionInput> = {}): CompletionInput => ({
  assignments: [graded('a1'), graded('a2')],
  pendingAssessmentCount: 0,
  unresolvedFlagCount: 0,
  intent: 'complete',
  acknowledgeIncomplete: false,
  ...over,
});

const item = (over: Partial<SnapshotSourceItem> & Pick<SnapshotSourceItem, 'itemClass'>): SnapshotSourceItem => ({
  id: `i-${over.itemClass}`,
  studentId: 's1',
  ...over,
});

// --- School Year state machine ---
describe('school year state machine', () => {
  it('completes Active into exactly one terminal outcome', () => {
    expect(canTransitionYear('Active', 'Completed')).toBe(true);
    expect(canTransitionYear('Active', 'Partial')).toBe(true);
    expect(canTransitionYear('Active', 'Withdrawn')).toBe(true);
  });

  it('makes every outcome terminal and rejects reopening the year', () => {
    for (const s of ['Completed', 'Partial', 'Withdrawn'] as const) {
      expect(isTerminalYear(s)).toBe(true);
      expect(canTransitionYear(s, 'Active')).toBe(false);
    }
    expect(() => assertYearTransition('Completed', 'Active')).toThrow(SchoolYearTransitionError);
  });
});

// --- Snapshot state machine ---
describe('snapshot state machine', () => {
  it('runs Draft → Approved → Superseded, Superseded terminal', () => {
    expect(canTransitionSnapshot('Draft', 'Approved')).toBe(true);
    expect(canTransitionSnapshot('Approved', 'Superseded')).toBe(true);
    expect(isTerminalSnapshot('Superseded')).toBe(true);
    expect(canTransitionSnapshot('Superseded', 'Approved')).toBe(false);
    expect(canTransitionSnapshot('Approved', 'Draft')).toBe(false);
    expect(() => assertSnapshotTransition('Approved', 'Draft')).toThrow(SnapshotTransitionError);
  });
});

// --- Completion preconditions ---
describe('completion-precondition evaluation', () => {
  it('completes cleanly when everything is terminal with no pending work', () => {
    const e = evaluateCompletionPreconditions(completeInput());
    expect(e.allowed).toBe(true);
    expect(e.outcome).toBe('Completed');
    expect(e.blockers).toEqual([]);
    expect(e.incompleteAcknowledged).toBe(false);
  });

  it('blocks completion on a non-terminal assignment, pending assessment, or unresolved flag', () => {
    expect(evaluateCompletionPreconditions(completeInput({ assignments: [graded('a1'), ungraded('a2')] })).allowed).toBe(false);
    expect(evaluateCompletionPreconditions(completeInput({ pendingAssessmentCount: 1 })).allowed).toBe(false);
    expect(evaluateCompletionPreconditions(completeInput({ unresolvedFlagCount: 2 })).allowed).toBe(false);
  });

  it('lists a content-free blocker for each outstanding class', () => {
    const e = evaluateCompletionPreconditions(
      completeInput({ assignments: [ungraded('a1')], pendingAssessmentCount: 1, unresolvedFlagCount: 1 }),
    );
    expect(e.allowed).toBe(false);
    expect(e.blockers).toHaveLength(3);
  });

  it('records a Partial year when the Owner acknowledges the incompletes', () => {
    const e = evaluateCompletionPreconditions(
      completeInput({ pendingAssessmentCount: 1, acknowledgeIncomplete: true }),
    );
    expect(e.allowed).toBe(true);
    expect(e.outcome).toBe('Partial');
    expect(e.incompleteAcknowledged).toBe(true);
  });

  it('treats exempted / acknowledged-incomplete assignments as terminal', () => {
    expect(isTerminalAssignment('graded')).toBe(true);
    expect(isTerminalAssignment('exempted')).toBe(true);
    expect(isTerminalAssignment('acknowledged_incomplete')).toBe(true);
    expect(isTerminalAssignment('submitted')).toBe(false);
    expect(isTerminalAssignment('in_progress')).toBe(false);
  });

  it('always allows withdrawal regardless of blockers, recording them', () => {
    const e = evaluateCompletionPreconditions(
      completeInput({ intent: 'withdraw', assignments: [ungraded('a1')], unresolvedFlagCount: 1 }),
    );
    expect(e.allowed).toBe(true);
    expect(e.outcome).toBe('Withdrawn');
    expect(e.blockers.length).toBeGreaterThan(0);
    expect(e.incompleteAcknowledged).toBe(true);
  });
});

// --- Snapshot assembly + exclusion filter (invariant 2) ---
describe('snapshot assembly + answer-key/adult-content exclusion filter', () => {
  it('excludes answer keys and teacher guides by rule, never overridable', () => {
    const a = assembleSnapshotContent(
      [
        item({ itemClass: 'answer_key', parentSelected: true, parentApproved: true }),
        item({ itemClass: 'teacher_guide', advisoryLabeled: true }),
      ],
      's1',
    );
    expect(a.included).toEqual([]);
    expect(a.excluded).toHaveLength(2);
    expect(isAnswerKeyMaterial('answer_key')).toBe(true);
    expect(isAnswerKeyMaterial('teacher_guide')).toBe(true);
    expect(isExcludedByRule('answer_key')).toBe(true);
  });

  it('excludes verbatim tutor transcripts and standalone AI grades', () => {
    const a = assembleSnapshotContent(
      [
        item({ itemClass: 'tutor_transcript_verbatim' }),
        item({ itemClass: 'ai_assessment_standalone_grade' }),
      ],
      's1',
    );
    expect(a.included).toEqual([]);
    expect(a.excluded).toHaveLength(2);
  });

  it('includes AI assessment only as advisory-labeled context', () => {
    const labeled = assembleSnapshotContent([item({ itemClass: 'ai_assessment_context', advisoryLabeled: true })], 's1');
    expect(labeled.included).toHaveLength(1);
    const unlabeled = assembleSnapshotContent([item({ itemClass: 'ai_assessment_context' })], 's1');
    expect(unlabeled.included).toEqual([]);
  });

  it('gates evidence/photos on parent selection and grades on parent approval', () => {
    const selected = assembleSnapshotContent(
      [
        item({ itemClass: 'evidence', parentSelected: true }),
        item({ itemClass: 'photo', parentSelected: true }),
        item({ itemClass: 'official_grade', parentApproved: true }),
      ],
      's1',
    );
    expect(selected.included).toHaveLength(3);

    const unselected = assembleSnapshotContent(
      [
        item({ itemClass: 'evidence' }),
        item({ itemClass: 'official_grade' }),
      ],
      's1',
    );
    expect(unselected.included).toEqual([]);
    expect(unselected.excluded).toHaveLength(2);
  });

  it('includes courses, confirmed mastery, attendance, tutor summaries, archive appendix', () => {
    const a = assembleSnapshotContent(
      [
        item({ itemClass: 'course' }),
        item({ itemClass: 'confirmed_mastery' }),
        item({ itemClass: 'attendance' }),
        item({ itemClass: 'tutor_summary' }),
        item({ itemClass: 'archive_appendix' }),
      ],
      's1',
    );
    expect(a.included).toHaveLength(5);
    expect(a.excluded).toEqual([]);
  });

  it('rejects cross-student items (bound to one student, invariant 1)', () => {
    const a = assembleSnapshotContent([item({ itemClass: 'course', studentId: 'OTHER' })], 's1');
    expect(a.included).toEqual([]);
    expect(a.excluded[0].reason).toMatch(/cross-student/);
  });

  it('assertNoAnswerKeyLeakage throws only if answer-key material survived', () => {
    expect(() => assertNoAnswerKeyLeakage([{ id: 'c1', itemClass: 'course' }])).not.toThrow();
    // Defence-in-depth: a hand-constructed leak fails loudly.
    expect(() =>
      assertNoAnswerKeyLeakage([{ id: 'x', itemClass: 'answer_key' as never }]),
    ).toThrow(/answer-key leak/);
  });
});

// --- Reopen supersession (invariant 5) ---
describe('snapshot reopen supersession', () => {
  it('starts at version 1 with no supersession', () => {
    expect(nextSnapshotChain(null)).toEqual({ version: 1, supersedesSnapshotId: null });
  });

  it('increments version and chains supersession on reopen', () => {
    expect(nextSnapshotChain({ id: 'snap1', version: 1 })).toEqual({
      version: 2,
      supersedesSnapshotId: 'snap1',
    });
  });
});
