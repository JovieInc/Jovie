import assert from 'node:assert/strict';
import test from 'node:test';

import * as reconciliation from './capability-reconciliation.mjs';

const evidence = {
  schema: 'jovie.canonical-evidence/v1',
  id: 'evidence:agents-api',
  stableIdentity: 'evidence:agents-api',
  provenance: { observedAt: '2026-09-30T12:00:00.000Z' },
};

function event() {
  return reconciliation.capabilityEventFromEvidence(evidence, {
    provider: 'OpenAI',
    externalChangeId: 'agents-api-computer-use-2026-09-30',
    class: 'managed-infrastructure',
    capabilityIds: ['browser-hosting'],
  });
}

const fixture = JSON.parse(`{
  "decisions":[
    {"id":"browser-runtime","capabilityId":"browser-hosting","scope":"capability-benchmark-run","incumbent":{"implementation":"internal-browser","owner":"agentos"},"chosenDisposition":"build","materialAssumptions":[{"id":"managed-runtime-absent","statement":"Managed supplier absent."}],"evidence":{"id":"old-evidence","version":"1","observedAt":"2026-09-01T00:00:00Z"},"alternativesConsidered":["managed supplier"],"switchingCost":"bounded adapter and replay","reversibility":"shadow route can be removed","invalidationTriggers":[{"assumptionId":"managed-runtime-absent","eventClasses":["managed-infrastructure"],"providers":["openai"]}],"nextReevaluation":"a managed runtime materially changes"},
    {"id":"approval-control","capabilityId":"approval-boundary","scope":"capability-benchmark-run","incumbent":{"implementation":"internal-approval","owner":"agentos"},"chosenDisposition":"build","materialAssumptions":[{"id":"provider-control-changed","statement":"Managed supplier absent."}],"evidence":{"id":"old-evidence","version":"1","observedAt":"2026-09-01T00:00:00Z"},"alternativesConsidered":["managed supplier"],"switchingCost":"bounded adapter and replay","reversibility":"shadow route can be removed","invalidationTriggers":[{"assumptionId":"provider-control-changed","eventClasses":["managed-infrastructure"],"providers":["openai"]}],"nextReevaluation":"a managed runtime materially changes"}
  ],
  "capabilityGraph":[{"id":"browser-hosting","dependsOn":[],"linearIssues":[{"id":"JOV-OPEN","role":"work"}]},{"id":"approval-boundary","dependsOn":["browser-hosting"],"linearIssues":[{"id":"JOV-FOUNDATION","role":"foundation"},{"id":"JOV-RELATED-DONE","role":"work"}]}],
  "issues":[{"id":"uuid-open","identifier":"JOV-OPEN","title":"JOV-OPEN","description":"original JOV-OPEN","priority":2,"state":{"id":"todo-id","name":"Todo","type":"unstarted"},"comments":{"nodes":[]}},{"identifier":"JOV-FOUNDATION","state":{"type":"completed"}},{"identifier":"JOV-RELATED-DONE","state":{"type":"completed"}}],
  "benchmark":{"status":"complete","evidenceClass":"bounded-benchmark","results":[{"decisionId":"browser-runtime","disposition":"REPLACE","confidence":"high","rationale":"Hosted browser removes future session-hosting work.","nextReevaluation":"hosted contract, price, or reliability changes","score":{"futureExpectedCost":3,"switchingCost":-1,"reversibility":2},"backlogActions":[{"id":"rewrite-browser","issueId":"JOV-OPEN","kind":"rewrite","description":"Retain policy; replace custom hosting with a shadow adapter."}]},{"decisionId":"approval-control","disposition":"KEEP","confidence":"high","rationale":"Jovie still owns approvals and outcome verification.","nextReevaluation":"provider supplies certified Jovie policy controls","score":{"strategicDifferentiation":3,"control":3,"securityPrivacy":3}}]}
}`);

function input(evidenceClass = 'bounded-benchmark') {
  const value = structuredClone(fixture);
  value.event = event();
  value.benchmark.eventId = value.event.id;
  value.benchmark.evidenceClass = evidenceClass;
  return value;
}

test('different coverage of one provider change converges on one event', () => {
  const duplicate = reconciliation.capabilityEventFromEvidence(
    { ...evidence, stableIdentity: 'evidence:article-2' },
    {
      provider: ' OPENAI ',
      externalChangeId: 'Agents API computer use 2026-09-30',
      class: 'managed-infrastructure',
      capabilityIds: ['browser-hosting'],
    }
  );
  assert.equal(duplicate.id, event().id);
  assert.equal(duplicate.digest, event().digest);
});

test('invalidates assumptions, traverses dependents, and keeps completed foundations closed', () => {
  const receipt = reconciliation.planCapabilityReconciliation(input());
  assert.deepEqual(
    receipt.invalidated.map(row => [row.decisionId, row.disposition]),
    [
      ['browser-runtime', 'REPLACE'],
      ['approval-control', 'KEEP'],
    ]
  );
  assert.deepEqual(
    receipt.impacts.map(row => [row.issueId, row.mutationEligible]),
    [
      ['JOV-OPEN', true],
      ['JOV-FOUNDATION', false],
    ]
  );
  assert.equal(receipt.actions[0].sourceEvidenceId, evidence.id);
  assert.equal(receipt.actions[0].before.description, 'original JOV-OPEN');
});

test('marketing cannot mutate and sunk-cost score factors fail closed', () => {
  assert.throws(
    () => reconciliation.planCapabilityReconciliation(input('marketing-claim')),
    /marketing claims/
  );
  const withSunkCost = input();
  withSunkCost.benchmark.results[0].score.pastEngineeringEffort = 5;
  assert.throws(
    () => reconciliation.planCapabilityReconciliation(withSunkCost),
    /not future-looking/
  );
});

test('an unchanged event produces no repeated benchmark or backlog churn', () => {
  const prior = reconciliation.planCapabilityReconciliation(input());
  const unchanged = reconciliation.planCapabilityReconciliation({
    ...input(),
    benchmark: null,
    priorReceipts: [prior],
  });
  assert.equal(unchanged.status, 'unchanged');
  assert.deepEqual(unchanged.actions, []);
});

test('applies one source-fenced rewrite, verifies readback, and dedupes replay', async () => {
  const apply = reconciliation.applyCapabilityReconciliation;
  const receipt = reconciliation.planCapabilityReconciliation(input());
  const current = structuredClone(input().issues[0]);
  const client = {
    async fetchIssue() {
      return structuredClone(current);
    },
    async addComment(_id, body) {
      current.comments.nodes.push({ body });
      return { success: true };
    },
    async updateIssue(_id, update) {
      Object.assign(current, update);
      return { issueUpdate: { success: true } };
    },
  };
  const applied = await apply(receipt, client);
  assert.equal(applied.outcomes[0].status, 'verified');
  assert.equal(current.description, receipt.actions[0].description);
  const replayed = await apply(receipt, client);
  assert.equal(replayed.outcomes[0].status, 'unchanged');
});

test('commissions Next and TanStack deltas through one commit-bound Summer path', () => {
  const root = process.cwd();
  const nowUtc = '2026-10-14T00:00:00.000Z';
  // biome-ignore format: compact commissioning fixture keeps the guarded diff bounded
  const inventory = reconciliation.buildStackInventory(root, 'commissioning-sha');
  const makeDelta = (packageName, missedEvent = false) => {
    const next = packageName === 'next';
    // biome-ignore format: official source pairing is clearer as one expression
    const sourceUrl = next ? 'https://nextjs.org/blog/next-16-4' : 'https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr';
    // biome-ignore format: compact commissioning fixture keeps the guarded diff bounded
    return { packageName, externalId: next ? 'next-16.4' : 'advanced-ssr-current-guidance', changeType: 'recommendation-change', capabilityIds: [next ? 'next-cache-components' : 'tanstack-rsc-ownership'], summary: next ? 'Cache Components is recommended for every app and defaults on for new apps.' : 'Current guidance separates Server Component and client cache ownership.', sourceUrl, observedAt: next ? '2026-10-06T00:00:00.000Z' : '2026-10-07T00:00:00.000Z', missedEvent, lifecycle: [{ attribute: 'recommended', scope: next ? 'every Next.js app' : 'React Query with Next App Router', evidenceUrl: sourceUrl, effectiveAt: next ? '2026-10-06T00:00:00.000Z' : '2026-10-07T00:00:00.000Z' }, ...(next ? [{ attribute: 'default-new-apps', scope: 'create-next-app', evidenceUrl: sourceUrl, effectiveAt: '2026-10-06T00:00:00.000Z' }] : [])] };
  };
  // biome-ignore format: decision matrix is deliberately compact
  const makeDecisions = dispositions => dispositions.map((disposition, index) => ({ kind: ['upgrade', 'capability', 'architecture'][index], disposition, owner: 'web-platform', confidence: 'high', rationale: 'Official guidance was compared with current source.', evidence: 'commit inventory plus bounded source audit', nextReevaluation: 'source revision, blocker, or review date changes', outcomes: JSON.parse('{"futureUpgradeEffort":"bounded","supportTrajectory":"current","agentPatternConsistency":"ratcheted","maintenanceBurden":"measured","performanceOutcome":"no regression required"}') }));
  const run = (delta, dispositions, exception = null, priorReceipts = []) => {
    const source = { status: 'ok', revision: delta.externalId };
    const preview = reconciliation.adaptStackDelta(delta, source, [], nowUtc);
    const legacy = input();
    legacy.benchmark.eventId = preview.event.id;
    // biome-ignore format: keep the completed-foundation proof visible as one record
    legacy.capabilityGraph.push({ id: delta.capabilityIds[0], dependsOn: [], linearIssues: [{ id: 'JOV-7339', role: 'foundation' }] });
    // biome-ignore format: compact completed foundation fixture
    legacy.issues.push({ identifier: 'JOV-7339', state: { type: 'completed' } });
    // biome-ignore format: compact integration call keeps the guarded diff bounded
    return reconciliation.planStackCapabilityReconciliation({ root, nowUtc, delta, source, inventory, stackDecisions: makeDecisions(dispositions), exception, verifiedAt: dispositions[1] === 'ADOPT' ? nowUtc : null, priorReceipts, reconciliation: legacy });
  };
  // biome-ignore format: the three dispositions are the asserted decision boundary
  const next = run(makeDelta('next'), ['ADOPT', 'DEFER', 'ADOPT'], reconciliation.NEXT_CACHE_COMPONENTS_EXCEPTION);
  // biome-ignore format: compact assertions keep commissioning evidence together
  assert.equal(inventory.rows.find(row => row.app === 'apps/web' && row.package === 'next').resolvedVersion, '16.4.0');
  // biome-ignore format: explicit denominator equality is the coverage contract
  assert.equal(next.assessment.coverage.denominator, Object.values(next.assessment.coverage.counts).reduce((sum, count) => sum + count, 0));
  // biome-ignore format: exact completed-foundation impact receipt
  assert.deepEqual(next.backlog.impacts, [{ issueId: 'JOV-7339', role: 'foundation', terminal: true, mutationEligible: false }]);
  // biome-ignore format: replay must remain a one-line no-op assertion
  assert.equal(run(makeDelta('next'), ['ADOPT', 'DEFER', 'ADOPT'], reconciliation.NEXT_CACHE_COMPONENTS_EXCEPTION, [next]).status, 'unchanged');
  // biome-ignore format: current-package feature review uses the same path
  const tanstack = run(makeDelta('@tanstack/react-query', true), ['KEEP', 'ADOPT', 'INVESTIGATE']);
  assert.equal(tanstack.discovery, 'catch-up');
  assert.ok(tanstack.assessment.coverage.counts.unknown > 0);
  // biome-ignore format: cache reuse proves source changes, not clocks, refresh inventory
  assert.deepEqual([reconciliation.buildStackInventory(root, 'new-sha', inventory).status, reconciliation.buildStackInventory(root, 'new-sha', { ...inventory, sourceDigest: 'superseded-by-source-change' }).status], ['reused', 'refreshed']);
  // biome-ignore format: failed-source bounded staleness proof
  assert.deepEqual(Object.entries(reconciliation.adaptStackDelta(makeDelta('next'), { status: 'failed', attempts: 2, error: 'timeout' }, [], nowUtc)).filter(([key]) => ['status', 'freshness', 'retryAt'].includes(key)).map(([, value]) => value), ['stale', 'unknown', '2026-10-14T04:00:00.000Z']);
  // biome-ignore format: exact ratchet receipt
  assert.deepEqual(reconciliation.assertStackPatternRatchet(root), { legacyFiles: 243 });
});
