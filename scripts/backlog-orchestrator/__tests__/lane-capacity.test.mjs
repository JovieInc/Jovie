import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildLaneCapacityReceipt,
  evaluateLaneCapacity,
} from '../lane-capacity.mjs';
import { collisionDomainsForPaths } from '../ownership-inventory.mjs';

const NOW = '2026-08-28T18:00:00.000Z';

function readyPr(number, paths, repository = 'JovieInc/Jovie') {
  return {
    number,
    repository,
    isDraft: false,
    mergeStateStatus: 'CLEAN',
    labels: [],
    files: paths.map(path => ({ path })),
  };
}

function receipt(prs, overrides = {}) {
  return buildLaneCapacityReceipt(prs, {
    observedAt: NOW,
    repositoryBudget: 15,
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
      collisionDomainsForPaths(['scripts/symphony/gem-priority-gate.py']),
      { now: NOW }
    );
    assert.equal(decision.allowed, true);
  });

  it('blocks writers that share the control-plane lane collision domain', () => {
    const evidence = receipt([
      readyPr(1, ['scripts/symphony/gem-priority-gate.py']),
      readyPr(2, ['scripts/symphony/gem-priority-gate.py']),
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
        'scripts/symphony/gem-priority-gate.py',
      ]).includes('risk:JovieInc/Jovie:control-plane'),
      true
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'lane-capacity-exhausted');
    assert.equal(decision.domain, 'lane:JovieInc/Jovie:symphony-control-plane');
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

  it('respects the per-repository ready ceiling', () => {
    const evidence = receipt([readyPr(1, ['apps/web/app/page.tsx'])], {
      repositoryBudget: 1,
    });
    const decision = evaluateLaneCapacity(
      evidence,
      collisionDomainsForPaths(['packages/ui/button.tsx']),
      { now: NOW }
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'repository-capacity-exhausted');
    assert.equal(decision.repository, 'JovieInc/Jovie');
  });

  it('deliberate red: Jovie queue congestion cannot block LogYourBody admission', () => {
    const evidence = receipt([readyPr(1, ['apps/web/app/page.tsx'])], {
      repositoryBudget: 1,
      repository: 'JovieInc/Jovie',
    });
    const decision = evaluateLaneCapacity(
      evidence,
      collisionDomainsForPaths(['apps/web/app/page.tsx'], {
        repo: 'JovieInc/LogYourBody',
      }),
      { now: NOW }
    );
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.repositories, ['JovieInc/LogYourBody']);
  });

  it('deliberate red: a saturated iOS lane does not stop independent web work', () => {
    const evidence = receipt([readyPr(1, ['apps/ios/App/AppDelegate.swift'])], {
      defaultLaneBudget: 1,
    });
    const decision = evaluateLaneCapacity(
      evidence,
      collisionDomainsForPaths(['apps/web/app/page.tsx']),
      { now: NOW }
    );
    assert.equal(decision.allowed, true);
  });

  it('positive dependency proof: an explicit shared lane still gates dependents', () => {
    const evidence = receipt([readyPr(1, ['apps/ios/App/AppDelegate.swift'])], {
      defaultLaneBudget: 1,
    });
    const decision = evaluateLaneCapacity(
      evidence,
      collisionDomainsForPaths(['.github/workflows/ios-testflight.yml']),
      { now: NOW }
    );
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'lane-capacity-exhausted');
    assert.equal(decision.domain, 'lane:JovieInc/Jovie:ios');
  });

  it('constrains only consumers mapped to an exhausted exact shared resource', () => {
    const resource = 'global-resource:apple-developer-account';
    const evidence = receipt([], {
      sharedResources: {
        [resource]: {
          resource,
          ready: 1,
          budget: 1,
          consumers: [
            'lane:JovieInc/Jovie:ios',
            'lane:JovieInc/LogYourBody:ios',
          ],
        },
      },
    });
    const ios = evaluateLaneCapacity(
      evidence,
      collisionDomainsForPaths(['apps/ios/App/AppDelegate.swift']),
      { now: NOW }
    );
    const web = evaluateLaneCapacity(
      evidence,
      collisionDomainsForPaths(['apps/web/app/page.tsx']),
      { now: NOW }
    );
    const lybIos = evaluateLaneCapacity(
      evidence,
      collisionDomainsForPaths(['apps/ios/App/AppDelegate.swift'], {
        repo: 'JovieInc/LogYourBody',
      }),
      { now: NOW }
    );
    assert.equal(ios.allowed, false);
    assert.equal(ios.code, 'shared-resource-capacity-exhausted');
    assert.equal(web.allowed, true);
    assert.equal(lybIos.allowed, false);
    assert.equal(lybIos.resource, resource);
  });
});
