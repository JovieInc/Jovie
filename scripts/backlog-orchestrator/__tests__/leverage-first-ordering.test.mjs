import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assessPreventionLeverage,
  leverageFirstViolations,
  orderLeverageFirst,
  rankAdmissionQueue,
  rankQueueCandidates,
  scoreIssue,
} from '../scorer.mjs';

function issue(identifier, overrides = {}) {
  return {
    identifier,
    title: overrides.title,
    labels: overrides.labels || [],
    effort: overrides.effort || 'small',
    mrrCategory: overrides.mrrCategory || 'reliability',
    mrrConfidence: overrides.mrrConfidence || 'high',
    area: overrides.area || 'design',
    relatedIssues: [],
    issue: {
      priority: overrides.priority ?? 3,
      createdAt: overrides.createdAt || '2026-10-01T00:00:00.000Z',
      description: overrides.description || '',
      labels: overrides.labels || [],
    },
  };
}

function withPrevention(candidates) {
  for (const candidate of candidates) {
    candidate.prevention = assessPreventionLeverage(candidate, candidates);
    candidate.score = scoreIssue(candidate).score;
  }
  return candidates;
}

function ids(result) {
  return result.ranked.map(candidate => candidate.identifier);
}

describe('JOV-7423 leverage-first ordering', () => {
  it('rejects a duplicate leaf repair that is ordered before its shared guard', () => {
    const cluster = {
      guard: 'JOV-6038',
      bounded: true,
      placement: 'guard-before-leaves',
      proofLeaf: 'JOV-4601',
      heldLeaves: ['JOV-4602', 'JOV-4603'],
      duplicationAvoided: 2,
    };
    const violations = leverageFirstViolations(
      ['JOV-4602', 'JOV-4601', 'JOV-6038'],
      [cluster]
    );
    assert.deepEqual(violations.map(violation => violation.leaf).sort(), [
      'JOV-4601',
      'JOV-4602',
    ]);
    assert.ok(
      violations.every(
        violation => violation.code === 'duplicate-leaf-before-shared-guard'
      )
    );
    assert.deepEqual(
      leverageFirstViolations(
        ['JOV-6038', 'JOV-4601', 'JOV-4700', 'JOV-4602'],
        [cluster]
      ),
      []
    );
  });

  it('admits a bounded shared guard before higher-scored duplicate leaf repairs', () => {
    const guard = issue('JOV-6038', {
      title: 'Guardrail: canonical pen production round-trip',
      labels: ['invariant'],
      effort: 'medium',
      mrrConfidence: 'low',
      priority: 3,
      createdAt: '2026-10-02T00:00:00.000Z',
    });
    const auth = issue('JOV-4601', {
      title: 'Repair auth profile design drift',
      effort: 'trivial',
      mrrCategory: 'paid',
      priority: 2,
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    const onboarding = issue('JOV-4602', {
      title: 'Repair onboarding profile design drift',
      effort: 'trivial',
      mrrCategory: 'paid',
      priority: 2,
      createdAt: '2026-09-02T00:00:00.000Z',
    });
    const breadth = issue('JOV-4700', {
      title: 'Ship referral experiment',
      area: 'growth',
      mrrCategory: 'acquisition',
      priority: 2,
      createdAt: '2026-09-15T00:00:00.000Z',
    });
    const candidates = withPrevention([guard, auth, onboarding, breadth]);

    assert.ok(auth.score > guard.score);
    assert.equal(guard.prevention.affectedIssues.length >= 2, true);

    const ranked = rankQueueCandidates(candidates, {
      selectedAt: '2026-10-03T00:00:00.000Z',
    });
    const cluster = ranked.receipt.leverageFirst.clusters[0];

    assert.deepEqual(ids(ranked), [
      'JOV-6038',
      'JOV-4601',
      'JOV-4700',
      'JOV-4602',
    ]);
    assert.equal(ranked.receipt.selectedCandidate, 'JOV-6038');
    assert.equal(cluster.placement, 'guard-before-leaves');
    assert.equal(cluster.bounded, true);
    assert.equal(cluster.proofLeaf, 'JOV-4601');
    assert.deepEqual(cluster.heldLeaves, ['JOV-4602']);
    assert.equal(cluster.duplicationAvoided, 1);
    assert.ok(ranked.receipt.orderingReasons.includes('leverage-first'));
    assert.deepEqual(
      leverageFirstViolations(
        ids(ranked),
        ranked.receipt.leverageFirst.clusters
      ),
      []
    );
    assert.equal(
      leverageFirstViolations(
        ['JOV-4601', 'JOV-4602', 'JOV-6038'],
        [cluster]
      ).some(violation => violation.leaf === 'JOV-4601'),
      true
    );
  });

  it('keeps revenue work ahead of a reusable guard and schedules the guard behind it', () => {
    const guard = issue('JOV-6038', {
      title: 'Guardrail: canonical pen production round-trip',
      labels: ['invariant'],
      effort: 'medium',
      mrrConfidence: 'medium',
      priority: 3,
    });
    const revenue = issue('JOV-4601', {
      title: 'Repair paid checkout design drift',
      mrrCategory: 'revenue-protection',
      priority: 2,
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    const profile = issue('JOV-4602', {
      title: 'Repair profile design drift',
      mrrCategory: 'paid',
      priority: 2,
      createdAt: '2026-09-03T00:00:00.000Z',
    });
    const ranked = rankQueueCandidates(
      withPrevention([guard, profile, revenue]),
      { selectedAt: '2026-10-03T00:00:00.000Z' }
    );
    assert.deepEqual(ids(ranked), ['JOV-4601', 'JOV-6038', 'JOV-4602']);
    assert.equal(
      ranked.receipt.leverageFirst.clusters[0].placement,
      'cone-before-guard'
    );
    assert.equal(
      ranked.receipt.leverageFirst.clusters[0].proofLeaf,
      'JOV-4601'
    );
    assert.deepEqual(
      leverageFirstViolations(
        ids(ranked),
        ranked.receipt.leverageFirst.clusters
      ),
      []
    );
  });

  it('repairs the cone before an unbounded guard and holds the extra leaf', () => {
    const guard = issue('JOV-6038', {
      title: 'Guardrail: canonical pen production round-trip',
      labels: ['invariant'],
      effort: 'large',
      mrrConfidence: 'medium',
      priority: 2,
    });
    const older = issue('JOV-4601', {
      title: 'Repair auth profile design drift',
      effort: 'small',
      priority: 3,
      createdAt: '2026-08-01T00:00:00.000Z',
    });
    const newer = issue('JOV-4602', {
      title: 'Repair dashboard profile design drift',
      effort: 'small',
      priority: 3,
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    const breadth = issue('JOV-4700', {
      title: 'Ship referral experiment',
      area: 'growth',
      mrrCategory: 'acquisition',
      priority: 3,
    });
    const ranked = rankQueueCandidates(
      withPrevention([guard, newer, breadth, older]),
      { selectedAt: '2026-10-03T00:00:00.000Z' }
    );
    assert.equal(ids(ranked)[0], 'JOV-4601');
    assert.equal(ids(ranked)[1], 'JOV-6038');
    assert.equal(ids(ranked).at(-1), 'JOV-4602');
    assert.equal(
      ranked.receipt.leverageFirst.clusters[0].placement,
      'cone-before-guard'
    );
    assert.deepEqual(
      leverageFirstViolations(
        ids(ranked),
        ranked.receipt.leverageFirst.clusters
      ),
      []
    );
  });

  it('releases one proof leaf while the guard ships and holds the rest', () => {
    const guard = issue('JOV-6038', {
      title: 'Guardrail: canonical pen production round-trip',
      labels: ['invariant'],
      effort: 'medium',
      state: 'In Progress',
    });
    const older = issue('JOV-4601', {
      title: 'Repair auth profile design drift',
      createdAt: '2026-08-01T00:00:00.000Z',
      priority: 2,
    });
    const newer = issue('JOV-4602', {
      title: 'Repair dashboard profile design drift',
      createdAt: '2026-09-01T00:00:00.000Z',
      priority: 2,
    });
    const breadth = issue('JOV-4700', {
      title: 'Ship referral experiment',
      area: 'growth',
      mrrCategory: 'acquisition',
      priority: 3,
    });
    const leaves = withPrevention([older, newer, breadth]);
    guard.prevention = assessPreventionLeverage(guard, [guard, ...leaves]);
    const open = rankQueueCandidates(leaves, {
      selectedAt: '2026-10-03T00:00:00.000Z',
      shippingGuards: [guard],
      inFlightIdentifiers: ['JOV-6038'],
    });
    assert.deepEqual(ids(open), ['JOV-4601', 'JOV-4700', 'JOV-4602']);
    assert.equal(
      open.receipt.leverageFirst.clusters[0].placement,
      'proof-while-guard-ships'
    );

    const inFlightProof = issue('JOV-4601', {
      title: 'Repair auth profile design drift',
      state: 'In Progress',
    });
    inFlightProof.prevention = null;
    const waiting = withPrevention([newer, breadth]);
    guard.prevention = assessPreventionLeverage(guard, [
      guard,
      inFlightProof,
      ...waiting,
    ]);
    const held = rankQueueCandidates(waiting, {
      selectedAt: '2026-10-04T00:00:00.000Z',
      shippingGuards: [guard],
      inFlightIdentifiers: ['JOV-6038', 'JOV-4601'],
    });
    assert.deepEqual(ids(held), ['JOV-4700', 'JOV-4602']);
    assert.equal(
      held.receipt.leverageFirst.clusters[0].placement,
      'hold-while-guard-ships'
    );
    assert.equal(held.receipt.leverageFirst.clusters[0].proofLeaf, 'JOV-4601');
    assert.deepEqual(held.receipt.leverageFirst.clusters[0].heldLeaves, [
      'JOV-4602',
    ]);
  });

  it('does not fast-track a guard that covers fewer than two issues', () => {
    const guard = issue('JOV-6038', {
      title: 'Guardrail: one-off pen note',
      labels: ['invariant'],
      effort: 'small',
      priority: 3,
    });
    const leaf = issue('JOV-4601', {
      title: 'Repair auth profile design drift',
      effort: 'trivial',
      mrrCategory: 'paid',
      priority: 2,
    });
    const ranked = rankQueueCandidates(withPrevention([guard, leaf]), {
      selectedAt: '2026-10-03T00:00:00.000Z',
    });
    assert.deepEqual(ids(ranked), ['JOV-4601', 'JOV-6038']);
    assert.deepEqual(ranked.receipt.leverageFirst.clusters, []);
    assert.equal(ranked.receipt.leverageFirst.duplicationAvoided, 0);
  });

  it('records the cluster on the admission reason while a guard is in progress', () => {
    const guard = issue('JOV-6038', {
      title: 'Guardrail: canonical pen production round-trip',
      labels: ['invariant'],
      effort: 'medium',
      state: 'In Progress',
    });
    const proof = issue('JOV-4601', {
      title: 'Repair auth profile design drift',
      createdAt: '2026-08-01T00:00:00.000Z',
      priority: 2,
    });
    const duplicate = issue('JOV-4602', {
      title: 'Repair dashboard profile design drift',
      createdAt: '2026-09-01T00:00:00.000Z',
      priority: 2,
    });
    const candidates = withPrevention([proof, duplicate]);
    guard.state = 'In Progress';
    guard.prevention = null;
    const ranked = rankAdmissionQueue(
      candidates,
      [guard, ...candidates],
      '2026-10-03T00:00:00.000Z'
    );
    assert.equal(ranked.ranked[0].identifier, 'JOV-4601');
    assert.match(
      ranked.reason,
      /leverage-first proof-while-guard-ships JOV-6038 avoids 1 duplicate leaf repair/
    );
  });

  it('orders an already assessed cluster without a second score', () => {
    const guard = {
      candidate: { identifier: 'JOV-1', effort: 'small' },
      priority: 3,
      preventionLeverage: { affectedIssues: ['JOV-2', 'JOV-3'] },
    };
    const proof = {
      candidate: {
        identifier: 'JOV-2',
        issue: { createdAt: '2026-01-01T00:00:00.000Z' },
      },
      priority: 3,
      preventionLeverage: { affectedIssues: [] },
    };
    const held = {
      candidate: {
        identifier: 'JOV-3',
        issue: { createdAt: '2026-02-01T00:00:00.000Z' },
      },
      priority: 3,
      preventionLeverage: { affectedIssues: [] },
    };
    const ordered = orderLeverageFirst([held, proof, guard]);
    assert.deepEqual(
      ordered.order.map(record => record.candidate.identifier),
      ['JOV-1', 'JOV-2', 'JOV-3']
    );
    assert.equal(ordered.receipt.schema, 'jovie.leverage-first-ordering/v1');
    assert.equal(ordered.receipt.issue, 'JOV-7423');
  });
});
