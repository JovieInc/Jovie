import { describe, expect, it } from 'vitest';
import {
  classifyRecoveryFiles,
  evaluateRecoveryCandidate,
  hasCompletePatch,
  validateRecoveryMergeProof,
} from '../ownerless-recovery-policy.mjs';

const head = 'a'.repeat(40);
const main = 'b'.repeat(40);
const created = '2026-08-15T00:00:00.000Z';
const pr = {
  state: 'open',
  draft: true,
  assignees: [],
  created_at: created,
  mergeable: true,
  mergeable_state: 'clean',
  labels: [{ name: 'queue-deferred' }],
  base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
  head: { sha: head, repo: { full_name: 'JovieInc/Jovie' } },
};

function evaluate(overrides = {}) {
  return evaluateRecoveryCandidate({
    pr,
    mainSha: main,
    compare: { behind_by: 0 },
    timeline: [],
    files: ['.github/workflows/nightly-tests.yml'],
    patch: '+run: pnpm test',
    checksPassing: true,
    now: Date.parse('2026-08-15T02:00:00.000Z'),
    ...overrides,
  });
}

describe('ownerless recovery policy', () => {
  it('admits focused green recovery work after one ownerless hour', () => {
    expect(evaluate()).toMatchObject({
      eligible: true,
      lanes: ['ci'],
      ownerlessSince: created,
    });
  });

  it.each([
    [{ pr: { ...pr, base: { ...pr.base, ref: 'stack-base' } } }, 'stacked-pr'],
    [{ containsOpenPrHead: true }, 'stacked-open-head'],
    [{ patchComplete: false }, 'changed-patch-incomplete'],
    [
      { now: Date.parse('2026-08-15T00:59:59.000Z') },
      'ownerless-under-threshold',
    ],
  ])('rejects unsafe eligibility state: %s', (overrides, reason) => {
    expect(evaluate(overrides)).toMatchObject({ eligible: false, reason });
  });

  it('rejects credential and control-plane mutations', () => {
    expect(
      classifyRecoveryFiles(
        ['.github/workflows/ci.yml'],
        '+private-key: ${{ secrets.KEY }}'
      ).eligible
    ).toBe(false);
    expect(
      classifyRecoveryFiles(
        ['.github/workflows/ci.yml'],
        '+run: git push origin HEAD:main\n+run: node ./scripts/helper.mjs'
      ).eligible
    ).toBe(false);
  });

  it('rejects omitted and truncated file patches', () => {
    expect(hasCompletePatch({ changes: 1 })).toBe(false);
    expect(hasCompletePatch({ changes: 2, patch: '@@\n+one' })).toBe(false);
  });

  it('requires exact-head authoritative merge or queue proof', () => {
    const queued = {
      headRefOid: head,
      isInMergeQueue: true,
      mergeQueueEntry: { id: 'MQE_1', position: 1, state: 'QUEUED' },
    };
    expect(validateRecoveryMergeProof(queued, head)).toEqual({
      proven: true,
      outcome: 'queued',
    });
    expect(
      validateRecoveryMergeProof(
        {
          ...queued,
          mergeQueueEntry: { ...queued.mergeQueueEntry, position: 0 },
        },
        head
      )
    ).toMatchObject({ proven: false });
  });
});
