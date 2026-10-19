import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

function commerceInput() {
  const value = input();
  value.decisions[0].commerceProjection = {
    offer: 'artist-visibility-offer-contract-v1',
    channel: 'agent-handoff',
    rail: 'ordinary-web-checkout',
    issueIds: ['JOV-4077', 'JOV-8218'],
  };
  value.capabilityGraph[0].linearIssues = [
    { id: 'JOV-4077', role: 'foundation' },
    { id: 'JOV-8218', role: 'work' },
  ];
  value.issues = [
    {
      id: 'uuid-4077',
      identifier: 'JOV-4077',
      title: 'Agentic commerce',
      description: 'Existing epic',
      priority: 2,
      state: { id: 'started-id', name: 'In Progress', type: 'started' },
      comments: { nodes: [] },
    },
    {
      id: 'uuid-8218',
      identifier: 'JOV-8218',
      title: 'Invalidate commerce rails',
      description: 'Existing invalidation issue',
      priority: 2,
      state: { id: 'todo-id', name: 'Todo', type: 'unstarted' },
      comments: { nodes: [] },
    },
  ];
  value.benchmark.results[0].backlogActions = [];
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
  assert.deepEqual(unchanged.linearReadyUpdates, []);
});

test('projects bounded Linear updates onto the existing epic and invalidation issue', async () => {
  const receipt = reconciliation.planCapabilityReconciliation(commerceInput());
  assert.deepEqual(
    receipt.linearReadyUpdates.map(update => update.issueId),
    ['JOV-4077', 'JOV-8218']
  );
  for (const update of receipt.linearReadyUpdates) {
    assert.equal(update.kind, 'comment');
    assert.match(update.body, /Offer: artist-visibility-offer-contract-v1/u);
    assert.match(update.body, /Channel: agent-handoff/u);
    assert.match(update.body, /Rail: ordinary-web-checkout/u);
    assert.match(update.body, /Prior decision: browser-runtime/u);
    assert.match(update.body, /Invalidating evidence: evidence:agents-api/u);
    assert.match(update.body, /Next re-evaluation:/u);
    assert.ok(update.body.length <= 2000);
  }

  const current = new Map(
    commerceInput().issues.map(issue => [issue.identifier, issue])
  );
  const client = {
    async fetchIssue(issueId) {
      return structuredClone(current.get(issueId));
    },
    async addComment(id, body) {
      const issue = [...current.values()].find(item => item.id === id);
      issue.comments.nodes.push({ body });
      return { success: true };
    },
  };
  const applied = await reconciliation.applyCapabilityReconciliation(
    receipt,
    client
  );
  assert.equal(applied.outcomes.filter(outcome => outcome.updateId).length, 2);
  const replayed = await reconciliation.applyCapabilityReconciliation(
    receipt,
    client
  );
  assert.deepEqual(
    replayed.outcomes.map(outcome => outcome.status),
    ['unchanged', 'unchanged']
  );
});

test('rejects Linear projection targets that are new or outside the affected graph', () => {
  const value = commerceInput();
  value.decisions[0].commerceProjection.issueIds.push('JOV-9999');
  assert.throws(
    () => reconciliation.planCapabilityReconciliation(value),
    /Linear-ready update is not eligible: JOV-9999/u
  );

  const sensitive = commerceInput();
  sensitive.event.evidenceId = 'pi_reusable';
  assert.throws(
    () => reconciliation.planCapabilityReconciliation(sensitive),
    /event evidenceId contains sensitive or reusable identifiers/u
  );
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
  assert.equal(inventory.rows.find(row => row.app === 'apps/web' && row.package === 'next').resolvedVersion, '16.4.1');
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
  assert.deepEqual(reconciliation.assertStackPatternRatchet(root), { legacyFiles: 245 });
});

const hash = value => createHash('sha256').update(value).digest('hex');
const NOW = new Date('2026-10-15T18:00:00.000Z');

function commerceSnapshot() {
  return {
    matrixDigest: hash('rail-matrix-r1'),
    policyDigest: hash('approved-policy'),
    geographyDigest: hash('approved-us-geography'),
    merchantOfRecord: 'jovie',
    eligible: true,
    geographyCompatible: true,
    hostedMerchReady: true,
    observedAt: '2026-10-15T17:00:00.000Z',
    expiresAt: '2026-10-16T17:00:00.000Z',
    access: {
      digest: hash('account-access-r1'),
      state: 'supported',
      observedAt: '2026-10-15T17:00:00.000Z',
      expiresAt: '2026-10-16T17:00:00.000Z',
    },
    price: {
      canonicalIdentityDigest: hash(
        'canonical-stripe-product-and-price-usd-19900-month'
      ),
      observedIdentityDigest: hash(
        'canonical-stripe-product-and-price-usd-19900-month'
      ),
    },
  };
}

function commerceChange(
  mutate = current => {
    current.eligible = false;
  },
  binding = { rail: 'ordinary-web-checkout', provider: 'openai' }
) {
  const value = commerceInput();
  const decision = value.decisions[0];
  decision.commerceProjection.rail = binding.rail;
  decision.commerceProjection.decisionRevision = 'decision-r4';
  decision.commerceProjection.evidence = commerceSnapshot();
  const current = commerceSnapshot();
  mutate(current);
  const change = { decision, current, provider: binding.provider, now: NOW };
  value.event = reconciliation.capabilityEventFromCommerceEvidence(
    evidence,
    change
  );
  value.benchmark = null;
  // A sibling with the same capability and event classes must stay untouched.
  value.decisions.push({
    ...structuredClone(decision),
    id: 'unaffected-rail',
    commerceProjection: {
      ...decision.commerceProjection,
      rail: 'unaffected-web-checkout',
    },
  });
  return { value, change };
}

/** @type {[string, (current: ReturnType<typeof commerceSnapshot>) => void, string][]} */
const commerceCases = [
  [
    'OpenAI eligibility',
    current => {
      current.eligible = false;
    },
    'eligibility-changed',
  ],
  [
    'Stripe preview access',
    current => {
      current.access.state = 'partner-gated';
    },
    'provider-access-lost',
  ],
  [
    'Stripe SPT receipt',
    current => {
      current.access.digest = hash('spt-access-revoked');
      current.access.state = 'unsupported';
    },
    'account-access-changed',
  ],
  [
    'hosted-merch readiness',
    current => {
      current.hostedMerchReady = false;
    },
    'hosted-merch-readiness-lost',
  ],
  [
    '$199 price identity',
    current => {
      current.price.observedIdentityDigest = hash(
        'different-stripe-product-same-usd-19900-month'
      );
    },
    'canonical-price-drift',
  ],
  [
    'policy',
    current => {
      current.policyDigest = hash('new-policy');
    },
    'policy-changed',
  ],
  [
    'geography',
    current => {
      current.geographyCompatible = false;
    },
    'geography-incompatible',
  ],
  [
    'merchant',
    current => {
      current.merchantOfRecord = 'creator';
    },
    'merchant-changed',
  ],
  [
    'matrix digest',
    current => {
      current.matrixDigest = hash('new-matrix');
    },
    'matrix-evidence-changed',
  ],
  [
    'expired evidence',
    current => {
      current.expiresAt = NOW.toISOString();
    },
    'evidence-expired',
  ],
  [
    'expired access receipt',
    current => {
      current.access.expiresAt = NOW.toISOString();
    },
    'evidence-expired',
  ],
  [
    'future observation',
    current => {
      current.observedAt = '2026-10-16T00:00:00.000Z';
    },
    'evidence-invalid',
  ],
];
for (const [name, mutate, reason] of commerceCases) {
  test(`${name} closes only the bound commerce decision and its canary`, () => {
    const rail = name.startsWith('Stripe preview')
      ? 'stripe-preview'
      : name.startsWith('Stripe SPT')
        ? 'stripe-spt'
        : name.startsWith('hosted-merch')
          ? 'hosted-merch'
          : 'ordinary-web-checkout';
    const { value } = commerceChange(mutate, {
      rail,
      provider:
        name.startsWith('Stripe') || name.startsWith('$199')
          ? 'stripe'
          : 'openai',
    });
    const receipt = reconciliation.planCapabilityReconciliation(value);
    assert.deepEqual(
      receipt.invalidated.map(row => row.decisionId),
      ['browser-runtime']
    );
    assert.equal(receipt.invalidated[0].disposition, 'DEFER');
    assert.deepEqual(receipt.actions, []);
    assert.equal(receipt.commerceInvalidations.length, 1);
    assert.deepEqual(receipt.commerceInvalidations[0], {
      ...value.event.commerce,
      invalidatingEvidence: evidence.id,
      sourceEventId: value.event.id,
      state: 'blocked',
      canary: 'invalidated',
    });
    assert.ok(receipt.commerceInvalidations[0].reasons.includes(reason));
    assert.ok(
      receipt.linearReadyUpdates[0].body.includes(
        `Offer: artist-visibility-offer-contract-v1\nChannel: agent-handoff\nRail: ${rail}\nPrior decision: browser-runtime`
      )
    );
    assert.match(
      receipt.linearReadyUpdates[0].body,
      /Invalidating evidence: evidence:agents-api\nNext re-evaluation:/u
    );
  });
}

test('unchanged commerce inputs emit no event and duplicate evidence does not repeat reconciliation', () => {
  const { change } = commerceChange(() => {});
  assert.equal(
    reconciliation.capabilityEventFromCommerceEvidence(evidence, change),
    null
  );
  const { value, change: changed } = commerceChange();
  const duplicate = reconciliation.capabilityEventFromCommerceEvidence(
    { ...evidence, stableIdentity: 'evidence:duplicate-coverage' },
    changed
  );
  assert.equal(duplicate.digest, value.event.digest);
  const prior = reconciliation.planCapabilityReconciliation(value);
  const replay = reconciliation.planCapabilityReconciliation({
    ...value,
    event: duplicate,
    priorReceipts: [prior],
  });
  assert.equal(replay.status, 'unchanged');
  assert.deepEqual(replay.commerceInvalidations, prior.commerceInvalidations);
  assert.deepEqual(replay.linearReadyUpdates, []);
});

test('expiry becomes a material event once, even when the source digest is unchanged', () => {
  const { change } = commerceChange(() => {});
  const expired = { ...change, now: new Date('2026-10-16T17:00:00.000Z') };
  const first = reconciliation.capabilityEventFromCommerceEvidence(
    evidence,
    expired
  );
  const later = reconciliation.capabilityEventFromCommerceEvidence(evidence, {
    ...expired,
    now: new Date('2026-10-16T18:00:00.000Z'),
  });
  assert.deepEqual(first.commerce.reasons, ['evidence-expired']);
  assert.equal(first.digest, later.digest);
});

test('old events cannot invalidate a newly certified revision or another offer/channel/rail', () => {
  for (const field of ['decisionRevision', 'offer', 'channel', 'rail']) {
    const { value } = commerceChange();
    value.decisions[0].commerceProjection[field] = 'new-binding';
    const receipt = reconciliation.planCapabilityReconciliation(value);
    assert.deepEqual(receipt.invalidated, []);
    assert.deepEqual(receipt.commerceInvalidations, []);
    assert.deepEqual(receipt.linearReadyUpdates, []);
  }
});

test('commerce events reject missing, malformed or unsafe evidence without leaking it', () => {
  const { change } = commerceChange();
  for (const current of [
    { ...change.current, matrixDigest: 'not-a-digest' },
    { ...change.current, merchantOfRecord: 'acct_private' },
    { ...change.current, access: null },
    { ...change.current, observedAt: 'yesterday' },
  ]) {
    assert.throws(() =>
      reconciliation.capabilityEventFromCommerceEvidence(evidence, {
        ...change,
        current,
      })
    );
  }
  const withExtra = {
    ...change.current,
    customerEmail: 'private@example.com',
    paymentIntent: 'pi_private',
  };
  const safe = reconciliation.capabilityEventFromCommerceEvidence(evidence, {
    ...change,
    current: withExtra,
  });
  assert.ok(!JSON.stringify(safe).includes('private'));
});

test('completed commerce work stays closed while the runtime block survives apply and replay', async () => {
  const { value } = commerceChange();
  for (const issue of value.issues) issue.state.type = 'completed';
  const receipt = reconciliation.planCapabilityReconciliation(value);
  assert.deepEqual(receipt.linearReadyUpdates, []);
  assert.equal(receipt.commerceInvalidations.length, 1);
  const applied = await reconciliation.applyCapabilityReconciliation(
    receipt,
    {}
  );
  assert.deepEqual(
    applied.commerceInvalidations,
    receipt.commerceInvalidations
  );
  const replay = reconciliation.planCapabilityReconciliation({
    ...value,
    priorReceipts: [applied],
  });
  assert.deepEqual(replay.commerceInvalidations, receipt.commerceInvalidations);
});
