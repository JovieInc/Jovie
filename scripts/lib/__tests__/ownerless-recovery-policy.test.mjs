import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { classifyQueueOwnership } from '../../ownerless-recovery-sweeper.mjs';
import {
  classifyRecoveryFiles,
  evaluateRecoveryCandidate,
} from '../ownerless-recovery-policy.mjs';

const head = 'a'.repeat(40);
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
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
    pr: { ...pr, ...overrides },
    mainSha: 'b'.repeat(40),
    compare: { behind_by: 0 },
    timeline: [],
    files: ['scripts/ci-merge-queue-check.mjs'],
    patch: '+const timeout = 9;',
    checksPassing: true,
    now: Date.parse('2026-08-15T02:00:00.000Z'),
  });
}

describe('ownerless recovery policy', () => {
  it('admits focused green recovery work after one ownerless hour', () => {
    expect(evaluate().eligible).toBe(true);
  });

  it('allows only non-worsening workflow tuning', () => {
    const classify = patch =>
      classifyRecoveryFiles(['.github/workflows/ci.yml'], patch).eligible;
    expect(
      classify('+run: node -e "process.mainModule.require(`child_process`)"')
    ).toBe(false);
    expect(classify('-timeout-minutes: 10\n+timeout-minutes: 9')).toBe(true);
    expect(classify('-max-parallel: 2\n+max-parallel: 999999')).toBe(false);
  });

  it('preserves queue and human policy holds for their owning controller', () => {
    for (const name of [
      'queue-deferred',
      'no-auto',
      'needs-human-review',
      'needs-human-taste',
      'needs-manual-rebase',
    ]) {
      expect(evaluate({ labels: [{ name }] })).toMatchObject({
        eligible: false,
        reason: `held:${name}`,
      });
    }
  });

  it('delegates exact-head intent to Auto-Enroll instead of writing the native queue', () => {
    const sweeper = readFileSync(
      `${repoRoot}/scripts/ownerless-recovery-sweeper.mjs`,
      'utf8'
    );
    const controller = readFileSync(
      `${repoRoot}/.github/workflows/merge-queue-autoenroll.yml`,
      'utf8'
    );

    expect(sweeper).toContain('ownerless-recovery-admission');
    expect(sweeper).not.toContain("'--auto'");
    expect(sweeper).not.toContain("'--disable-auto'");
    expect(controller).toContain('types: [ownerless-recovery-admission]');
    expect(controller).toContain('group: merge-queue-drain-mutex');
  });

  it('does not redispatch an exact head already owned by the native queue', () => {
    const queued = {
      headRefOid: head,
      queued: true,
      autoMergeEnabled: true,
    };
    expect(classifyQueueOwnership(queued, head)).toEqual({
      action: 'no_dispatch',
      outcome: 'already-delegated-exact-head',
    });
    expect(classifyQueueOwnership(queued, head)).toEqual({
      action: 'no_dispatch',
      outcome: 'already-delegated-exact-head',
    });
  });

  it('refuses foreign auto-merge or changed-head ownership', () => {
    expect(
      classifyQueueOwnership(
        { headRefOid: head, queued: false, autoMergeEnabled: true },
        head
      )
    ).toEqual({ action: 'fail', outcome: 'foreign-auto-merge-hold' });
    expect(
      classifyQueueOwnership(
        {
          headRefOid: 'c'.repeat(40),
          queued: false,
          autoMergeEnabled: false,
        },
        head
      )
    ).toEqual({ action: 'fail', outcome: 'queue-ownership-head-mismatch' });
  });
});
