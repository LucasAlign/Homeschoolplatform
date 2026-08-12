import { describe, expect, it } from 'vitest';
import {
  canTransition,
  isTerminal,
  assertTransition,
  ImportTransitionError,
} from '../../src/modules/ingestion/state-machine';
import { isAdultOnly, requiresSplit } from '../../src/modules/ingestion/types';
import { isBatchApprovable, BATCH_CONFIDENCE_THRESHOLD } from '../../src/modules/ingestion/approval-policy';
import type { ExtractedDraft } from '../../src/modules/ingestion/types';

describe('import state machine', () => {
  it('permits the canonical happy path', () => {
    expect(canTransition('Uploaded', 'Preflight')).toBe(true);
    expect(canTransition('Preflight', 'Queued')).toBe(true);
    expect(canTransition('Queued', 'Processing')).toBe(true);
    expect(canTransition('Processing', 'ExtractedDraft')).toBe(true);
    expect(canTransition('ExtractedDraft', 'Approved')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('Uploaded', 'Approved')).toBe(false);
    expect(canTransition('Processing', 'Approved')).toBe(false);
    expect(canTransition('Approved', 'Processing')).toBe(false);
  });

  it('marks terminals and blocks transitions out of them', () => {
    expect(isTerminal('Approved')).toBe(true);
    expect(isTerminal('Failed')).toBe(true);
    expect(isTerminal('Rejected')).toBe(true);
    expect(isTerminal('Processing')).toBe(false);
    expect(() => assertTransition('Approved', 'Processing')).toThrow(ImportTransitionError);
  });

  it('allows correction to loop back', () => {
    expect(canTransition('ExtractedDraft', 'NeedsCorrection')).toBe(true);
    expect(canTransition('NeedsCorrection', 'Preflight')).toBe(true);
  });
});

describe('material-role isolation', () => {
  it('treats answer keys and teacher guides as adult-only', () => {
    expect(isAdultOnly('answer_key')).toBe(true);
    expect(isAdultOnly('teacher_guide')).toBe(true);
    expect(isAdultOnly('student')).toBe(false);
    expect(isAdultOnly('mixed')).toBe(false);
  });
  it('flags mixed material for split', () => {
    expect(requiresSplit('mixed')).toBe(true);
    expect(requiresSplit('student')).toBe(false);
  });
});

describe('batch-approval eligibility', () => {
  const base: ExtractedDraft = {
    importId: 'i1',
    courseTitle: 'C',
    lessons: [],
    overallConfidence: 0.95,
    internallyConsistent: true,
    qualityFlags: [],
  };

  it('approves high-confidence, consistent, unflagged drafts', () => {
    expect(isBatchApprovable(base)).toBe(true);
  });
  it('blocks low confidence', () => {
    expect(isBatchApprovable({ ...base, overallConfidence: BATCH_CONFIDENCE_THRESHOLD - 0.01 })).toBe(false);
  });
  it('blocks inconsistent drafts', () => {
    expect(isBatchApprovable({ ...base, internallyConsistent: false })).toBe(false);
  });
  it('blocks drafts with cutoff or low-confidence flags', () => {
    expect(isBatchApprovable({ ...base, qualityFlags: [{ kind: 'cutoff', page: 1 }] })).toBe(false);
    expect(isBatchApprovable({ ...base, qualityFlags: [{ kind: 'low_confidence', page: 2 }] })).toBe(false);
  });
  it('tolerates non-blocking flags', () => {
    expect(isBatchApprovable({ ...base, qualityFlags: [{ kind: 'glare', page: 1 }] })).toBe(true);
  });
});
