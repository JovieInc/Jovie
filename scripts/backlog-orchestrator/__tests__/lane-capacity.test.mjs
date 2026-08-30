import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildLaneCapacityReceipt,
  evaluateLaneCapacity,
} from '../lane-capacity.mjs';
import { collisionDomainsForPaths } from '../ownership-inventory.mjs';

const NOW = '2026-08-28T18:00:00.000Z';

function readyPr(number, paths) {
  return {
    number,
    isDraft: false,
    mergeStateStatus: 'CLEAN',
    labels: [],
    files: paths.map(path => ({ path })),
  };
}

function receipt(prs, overrides = {}) {
  return buildLaneCapacityReceipt(prs, {
    observedAt: NOW,
    globalBudget: 15,
    defaultLaneBudget: 2,
    ...overrides,
  });
}

describe('lane capacity receipts', () => {
  it('does not let saturated web work block an independent empty CI lane', () => {
    const evidence = receipt([
      readyPr(1, ['apps/web/app/page.tsx']),
      readyPr(2, ['apps/web/app/layout.tsx']),
    ]);
    const decision = evaluateLaneCapacity(
      evidence,
      collisionDomainsForPaths(['scripts/hermes/gem-priority-gate.py']),
      { now: NOW }
    );
    assert.equal(decision.allowed, true);
  });

  it('blocks writers that share the CI control-plane collision domain', () => {
    const evidence = receipt([
      readyPr(1, ['.github/workflows/ci.yml']),
      readyPr(2, ['scripts/hermes/gem-priority-gate.py']),
    ]);
    const decision = evaluateLaneCapacity(
      evidence,
      collisionDomainsForPaths([
        'scripts/backlog-orchestrator/backlog-orchestrator.mjs',
      ]),
      { now: NOW }
    );
    assert.deepEqual(
      collisionDomainsForPaths([
        'scripts/hermes/gem-priority-gate.py',
      ]).includes('risk:JovieInc/Jovie:control-plane'),
      true
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'lane-capacity-exhausted');
    assert.equal(decision.domain, 'risk:JovieInc/Jovie:control-plane');
  });

  it('blocks writers that share the database schema collision domain', () => {
    const evidence = receipt([
      readyPr(1, ['drizzle/migrations/0001.sql']),
      readyPr(2, ['apps/web/lib/db/schema.ts']),
    ]);
    const decision = evaluateLaneCapacity(
      evidence,
      collisionDomainsForPaths(['apps/web/lib/db/schema/customer.ts']),
      { now: NOW }
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.domain, 'risk:JovieInc/Jovie:database-schema');
  });

  it('fails closed when lane evidence is stale', () => {
    const decision = evaluateLaneCapacity(receipt([]), ['artifact:x:y'], {
      now: '2026-08-28T18:11:00.000Z',
    });
    assert.equal(decision.allowed, false);
    assert.equal(
      decision.code,
      'lane-capacity-evidence-missing-malformed-or-stale'
    );
  });

  it('respects the shared global ready ceiling', () => {
    const evidence = receipt([readyPr(1, ['apps/web/app/page.tsx'])], {
      globalBudget: 1,
    });
    const decision = evaluateLaneCapacity(
      evidence,
      collisionDomainsForPaths(['packages/ui/button.tsx']),
      { now: NOW }
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'global-capacity-exhausted');
  });
});
