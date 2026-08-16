import { describe, expect, it } from 'vitest';
import {
  classifyRecoveryFiles,
  evaluateRecoveryCandidate,
  renderRecoveryReceipt,
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
    [{ compare: { behind_by: 1 } }, 'stale-current-main'],
    [{ containsOpenPrHead: true }, 'stacked-open-head'],
    [{ patchComplete: false }, 'changed-patch-incomplete'],
    [
      { pr: { ...pr, mergeable: false, mergeable_state: 'dirty' } },
      'conflicted-or-unknown',
    ],
    [{ checksPassing: false }, 'focused-checks-not-green'],
    [
      { pr: { ...pr, assignees: [{ login: 'owner' }] } },
      'ownerless-under-threshold',
    ],
    [
      { now: Date.parse('2026-08-15T00:59:59.000Z') },
      'ownerless-under-threshold',
    ],
  ])('rejects unsafe eligibility state: %s', (overrides, reason) => {
    expect(evaluate(overrides)).toMatchObject({ eligible: false, reason });
  });

  it('admits waitlist canary tests but rejects runtime, credential, and production paths', () => {
    expect(
      classifyRecoveryFiles([
        'apps/web/tests/e2e/synthetic-production-waitlist.spec.ts',
        'apps/web/tests/unit/e2e/production-waitlist-canary.test.ts',
      ])
    ).toMatchObject({ eligible: true, lanes: ['waitlist-canary'] });
    expect(
      classifyRecoveryFiles(
        ['.github/workflows/ci.yml'],
        '+private-key: ${{ secrets.KEY }}'
      ).eligible
    ).toBe(false);
    expect(
      classifyRecoveryFiles(
        ['.github/workflows/ci.yml'],
        '-  contents: read\n+  contents: write'
      )
    ).toMatchObject({ eligible: false, reason: 'material-risk-change' });
  });

  it('renders an exact-head action receipt without claiming unproven merge', () => {
    const body = renderRecoveryReceipt({
      pr: 42,
      head,
      main,
      ownerlessSince: created,
      lanes: ['ci'],
      action: 'gh-pr-merge-auto-squash',
      outcome: 'requested-unproven',
      observedAt: '2026-08-15T02:00:00.000Z',
    });
    expect(body).toMatch(
      /jovie-ownerless-recovery\/v1[\s\S]*requested-unproven/
    );
    expect(body).toMatch(/evidenceSha256[\s\S]*merge proof only when/);
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
      validateRecoveryMergeProof({ ...queued, headRefOid: main }, head)
    ).toMatchObject({ proven: false });
    expect(
      validateRecoveryMergeProof(
        {
          ...queued,
          mergeQueueEntry: { ...queued.mergeQueueEntry, position: 0 },
        },
        head
      )
    ).toMatchObject({ proven: false });
    const merged = {
      state: 'MERGED',
      headRefOid: head,
      mergedAt: '2026-08-15T02:01:00.000Z',
      mergeCommit: { oid: main },
    };
    expect(validateRecoveryMergeProof(merged, head)).toEqual({
      proven: true,
      outcome: 'merged',
    });
  });
});
