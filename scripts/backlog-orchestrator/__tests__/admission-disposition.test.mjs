import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ADMISSION_SCAN_SCHEMA,
  buildAdmissionScan,
  classifyAdmissionDisposition,
  clearAdmissionFailure,
  eligibleOrder,
  recordAdmissionFailure,
} from '../admission-disposition.mjs';

const NOW = '2026-08-09T17:00:00.000Z';
const DESCRIPTION = `## Problem
One bounded controller edge is wrong.

## Proposed fix
Repair the deterministic path.

## Acceptance criteria
- Focused coverage passes.`;

function issue(identifier, overrides = {}) {
  return {
    id: `id-${identifier}`,
    identifier,
    title: 'Repair one controller edge',
    description: DESCRIPTION,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    priority: 3,
    state: { name: 'Backlog' },
    assignee: null,
    labels: { nodes: [] },
    children: { nodes: [] },
    comments: { nodes: [] },
    ...overrides,
  };
}

function machineIssue(identifier, state) {
  return issue(identifier, {
    state: { name: state },
    labels: { nodes: [{ name: 'symphony' }, { name: 'admission-approved' }] },
    comments: { nodes: [{ body: '<!-- symphony-admission:v1 {} -->' }] },
  });
}

function classify(candidate, options = {}) {
  return classifyAdmissionDisposition(candidate, { now: NOW, ...options });
}

function expect(candidate, outcome, reason, options) {
  const result = classify(candidate, options);
  assert.deepEqual([result.outcome, result.reason.code], [outcome, reason]);
  assert.equal(result.fingerprint, classify(candidate, options).fingerprint);
  return result;
}

describe('exhaustive Symphony admission dispositions', () => {
  it('accounts for every unique issue exactly once', () => {
    const eligible = issue('JOV-1');
    const scan = buildAdmissionScan(
      [
        eligible,
        machineIssue('JOV-2', 'Todo'),
        machineIssue('JOV-3', 'In Progress'),
        issue('JOV-4', { assignee: { id: 'owner' } }),
        issue('OPS-5'),
        { ...eligible },
      ],
      { now: NOW }
    );
    assert.equal(scan.schema, ADMISSION_SCAN_SCHEMA);
    assert.deepEqual(
      [
        scan.counts.totalEvaluated,
        scan.counts.eligible,
        scan.counts.queued,
        scan.counts.claimed,
        scan.counts.deferred,
        scan.counts.rejected,
        scan.counts.unclassified,
      ],
      [5, 1, 1, 1, 1, 1, 0]
    );
    assert.deepEqual(scan.counts.byReason, {
      deferred: { 'already-assigned': 1 },
      rejected: { 'unrouted-team': 1 },
    });
    assert.deepEqual(scan.invariant, {
      classifiedSum: 5,
      matchesTotal: true,
      unclassifiedZero: true,
    });
    assert.deepEqual(scan.coverage.duplicateKeys, ['JOV-1']);
  });

  it('uses readiness labels as evidence rather than an ordinary-work prerequisite', () => {
    const plain = expect(issue('JOV-10'), 'eligible', 'deterministic-safe');
    assert.deepEqual(plain.evidence.readiness, {
      agentReady: false,
      readyForIntake: false,
      planApproved: false,
      admissionApproved: false,
    });
    const labelled = classify(
      issue('JOV-11', {
        labels: { nodes: [{ name: 'agent-ready' }, { name: 'plan-approved' }] },
      })
    );
    assert.equal(labelled.outcome, 'eligible');
    assert.equal(labelled.evidence.readiness.agentReady, true);
  });

  it('preserves active, foreign, and ambiguous ownership', () => {
    const ownershipByIdentifier = {
      'JOV-20': { status: 'active', owner: 'Symphony', leaseId: 'lease-1' },
      'JOV-21': { status: 'active', owner: 'Codex task 42' },
    };
    assert.equal(
      expect(issue('JOV-20'), 'claimed', 'symphony-active-claim', {
        ownershipByIdentifier,
      }).ownership.leaseId,
      'lease-1'
    );
    expect(issue('JOV-21'), 'deferred', 'owned-by-other', {
      ownershipByIdentifier,
    });
    expect(
      issue('JOV-22', { labels: { nodes: [{ name: 'symphony' }] } }),
      'deferred',
      'ownership-ambiguous'
    );
    expect(
      machineIssue('JOV-23', 'Backlog'),
      'deferred',
      'ownership-ambiguous'
    );
    expect(
      issue('JOV-24', {
        comments: { nodes: [], pageInfo: { hasNextPage: true } },
      }),
      'deferred',
      'nested-evidence-incomplete'
    );
  });

  it('gives protected, sensitive, active, parent, incomplete, and stale work typed outcomes', () => {
    const cases = [
      [
        issue('JOV-30', { assignee: { id: 'tim', name: 'Tim White' } }),
        'deferred',
        'tim-owned',
      ],
      [
        issue('JOV-31', { labels: { nodes: [{ name: 'needs-human' }] } }),
        'deferred',
        'protected-policy',
      ],
      [
        issue('JOV-32', { title: 'Rotate production credential' }),
        'deferred',
        'sensitive-or-external-work',
      ],
      [
        issue('JOV-33', {
          pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/1',
        }),
        'deferred',
        'active-pull-request',
      ],
      [
        issue('JOV-34', { children: { nodes: [{ id: 'child' }] } }),
        'rejected',
        'parent-or-bundle',
      ],
      [
        issue('JOV-35', { description: 'Incomplete' }),
        'deferred',
        'scope-section-missing',
      ],
      [
        issue('JOV-36', { createdAt: '2025-01-01T00:00:00.000Z' }),
        'deferred',
        'stale-or-invalid-created-at',
      ],
    ];
    for (const [candidate, outcome, reason] of cases)
      expect(candidate, outcome, reason);
  });

  it('hard-stops every human hold label but preserves exact-label boundaries', () => {
    for (const label of [
      'needs-human',
      'held',
      'decision-required',
      'manual-incident',
    ]) {
      const result = expect(
        issue(`JOV-${label.length}`, { labels: { nodes: [{ name: label }] } }),
        'deferred',
        'protected-policy'
      );
      assert.equal(result.reason.retryable, false);
      assert.deepEqual(result.preAdmission.matchedLabels, [label]);
    }

    const nearMiss = classify(
      issue('JOV-39', {
        labels: { nodes: [{ name: 'needs-human-follow-up' }] },
      })
    );
    assert.equal(nearMiss.outcome, 'eligible');
    assert.equal(nearMiss.preAdmission.allowed, true);
  });

  it('immutably isolates a second failure and clears it after success', () => {
    const original = { 'JOV-40': { attempts: 0 }, other: { attempts: 1 } };
    const first = recordAdmissionFailure(original, 'JOV-40', {
      now: '2026-08-09T16:58:00.000Z',
      reason: 'plan-failed',
    });
    const second = recordAdmissionFailure(first, 'JOV-40', {
      now: '2026-08-09T16:59:00.000Z',
      reason: 'admission-failed',
    });
    assert.equal(original['JOV-40'].attempts, 0);
    assert.equal(first.other, original.other);
    assert.deepEqual(
      [first['JOV-40'].attempts, first['JOV-40'].poison],
      [1, false]
    );
    assert.deepEqual(
      [second['JOV-40'].attempts, second['JOV-40'].poison],
      [2, true]
    );

    const isolated = buildAdmissionScan([issue('JOV-40'), issue('JOV-41')], {
      now: NOW,
      historyByIdentifier: second,
    });
    assert.equal(isolated.counts.byReason.deferred['poison-item-backoff'], 1);
    assert.deepEqual(
      eligibleOrder(isolated).map(item => item.identifier),
      ['JOV-41']
    );

    const cleared = clearAdmissionFailure(second, 'JOV-40', { now: NOW });
    assert.deepEqual(
      [cleared['JOV-40'].attempts, cleared['JOV-40'].poison],
      [0, false]
    );
    assert.equal(
      classify(issue('JOV-40'), { historyByIdentifier: cleared }).outcome,
      'eligible'
    );
  });

  it('orders never-evaluated work first, then by priority and age', () => {
    const scan = buildAdmissionScan(
      [
        issue('JOV-50', { priority: 4 }),
        issue('JOV-51', { priority: 1, createdAt: '2026-08-08T00:00:00Z' }),
        issue('JOV-52', { priority: 1 }),
      ],
      {
        now: NOW,
        historyByIdentifier: {
          'JOV-52': { lastEvaluatedAt: '2026-08-09T16:00:00.000Z' },
        },
      }
    );
    assert.deepEqual(
      eligibleOrder(scan).map(item => item.identifier),
      ['JOV-51', 'JOV-50', 'JOV-52']
    );
  });
});
