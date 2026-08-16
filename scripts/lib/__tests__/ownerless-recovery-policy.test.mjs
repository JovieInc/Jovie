import { describe, expect, it } from 'vitest';
import {
  classifyRecoveryFiles,
  evaluateRecoveryCandidate,
  hasCompletePatch,
  validateRecoveryMergeProof,
} from '../ownerless-recovery-policy.mjs';

const head = 'a'.repeat(40);
const created = '2026-08-15T00:00:00.000Z';
const pr = {
  state: 'open',
  assignees: [],
  created_at: created,
  mergeable: true,
  base: { ref: 'main', repo: { full_name: 'JovieInc/Jovie' } },
  head: { sha: head, repo: { full_name: 'JovieInc/Jovie' } },
};

function evaluate(overrides = {}) {
  return evaluateRecoveryCandidate({
    pr,
    mainSha: 'b'.repeat(40),
    compare: { behind_by: 0 },
    timeline: [],
    files: ['scripts/ci-merge-queue-check.mjs'],
    patch: '+const timeout = 9;',
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
    });
  });

  it('rejects credential and control-plane mutations', () => {
    expect(
      classifyRecoveryFiles(
        ['.github/workflows/ci.yml'],
        '+run: node -e "require(`node:child_process`).execFileSync(`git`,[`push`])"'
      ).eligible
    ).toBe(false);
    expect(
      classifyRecoveryFiles(['.github/workflows/ci.yml'], '+timeout-minutes: 9')
        .eligible
    ).toBe(true);
  });

  it('rejects omitted and truncated file patches', () => {
    expect(hasCompletePatch({ changes: 2, patch: '@@\n+one' })).toBe(false);
  });

  it('requires authoritative queue proof', () => {
    const queued = {
      headRefOid: head,
      isInMergeQueue: true,
      mergeQueueEntry: { id: 'MQE_1', position: 1, state: 'QUEUED' },
    };
    expect(validateRecoveryMergeProof(queued, head)).toEqual({
      proven: true,
      outcome: 'queued',
    });
  });
});
