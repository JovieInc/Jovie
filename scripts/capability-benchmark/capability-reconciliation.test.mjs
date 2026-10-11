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
