import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyRecoveryFiles,
  evaluateRecoveryCandidate,
  ownerlessSince,
  renderRecoveryReceipt,
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

  it('uses the latest unassignment as the ownerless clock', () => {
    expect(
      ownerlessSince(pr, [
        { event: 'assigned', created_at: '2026-08-15T00:30:00Z' },
        { event: 'unassigned', created_at: '2026-08-15T01:30:00Z' },
      ])
    ).toBe('2026-08-15T01:30:00Z');
  });

  it('admits waitlist canary tests but rejects runtime, credential, and production paths', () => {
    expect(
      classifyRecoveryFiles([
        'apps/web/tests/e2e/synthetic-production-waitlist.spec.ts',
        'apps/web/tests/unit/e2e/production-waitlist-canary.test.ts',
      ])
    ).toMatchObject({ eligible: true, lanes: ['waitlist-canary'] });
    expect(
      classifyRecoveryFiles([
        'apps/web/app/api/canary/waitlist/receipt/route.ts',
      ]).eligible
    ).toBe(false);
    expect(
      classifyRecoveryFiles(['.github/workflows/production-controller.yml'])
        .eligible
    ).toBe(false);
    expect(
      classifyRecoveryFiles(
        ['.github/workflows/ci.yml'],
        '+private-key: ${{ secrets.KEY }}'
      ).eligible
    ).toBe(false);
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
    expect(body).toContain('jovie-ownerless-recovery/v1');
    expect(body).toContain('requested-unproven');
    expect(body).toContain('merge proof only when');
    expect(body).toContain('evidenceSha256');
  });
});

describe('ownerless recovery workflow contract', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const workflow = readFileSync(
    resolve(root, '.github/workflows/ownerless-recovery-sweep.yml'),
    'utf8'
  );
  const sweeper = readFileSync(
    resolve(root, 'scripts/ownerless-recovery-sweeper.mjs'),
    'utf8'
  );

  it('runs on hosted GitHub state without Gem or Symphony', () => {
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).toContain('schedule:');
    expect(workflow).not.toMatch(/runs-on:.*self-hosted/);
    expect(workflow).not.toContain('FLEET_RECEIPT');
    expect(workflow).not.toContain('gem-priority-gate');
    expect(workflow).not.toContain('scripts/hermes/symphony');
  });

  it('requests exact-head native merge and reads authoritative queue proof', () => {
    expect(sweeper).toContain("'--match-head-commit'");
    expect(sweeper).toContain('mergeQueueEntry{position state}');
    expect(sweeper).toContain("outcome: 'merge-request-failed'");
    expect(sweeper).toContain("'requested-unproven'");
  });
});
