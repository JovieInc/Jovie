/**
 * E2E regressions for the pre-lease context and research boundaries
 * (JOV-5032): GBrain outage, ownership conflict, research-required missing
 * evidence, not-required rationale, stale citation, and the successful
 * context → research → plan → admission → lease flow.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as admissionGate from '../admission-gate.mjs';
import * as admitter from '../admitter.mjs';
import * as contextGate from '../context-gate.mjs';
import * as planGate from '../plan-gate.mjs';
import * as researchGate from '../research-gate.mjs';
import { researchEvidenceFor, withPreLeaseReceipts } from './pre-lease.mjs';

const NOW = new Date().toISOString();

function issue(overrides = {}) {
  return {
    id: 'issue-id',
    identifier: 'JOV-5032',
    title: 'Bind pre-lease context receipts',
    description: 'Deterministic control-plane work inside this repository.',
    state: { id: 'triage-id', name: 'Triage', type: 'triage' },
    project: { name: 'Infra & CI/CD', slugId: 'abc123' },
    assignee: null,
    pullRequestUrl: null,
    labels: { nodes: [] },
    comments: { nodes: [] },
    ...overrides,
  };
}

function researchRequiredIssue(overrides = {}) {
  return issue({
    title: 'Upgrade the Sentry npm dependency for the SDK breaking change',
    description:
      'Track the external API deprecation in the vendor changelog before upgrading the package version.',
    ...overrides,
  });
}

function planEvidence() {
  return {
    verified: true,
    concrete: true,
    bounded: true,
    repo: 'JovieInc/Jovie',
    project: 'Infra & CI/CD',
    owners: { implementation: 'Symphony', verification: 'Gem' },
    scope: 'Bind pre-lease context and research receipts in the control plane',
    acceptance: ['Receipts revalidate semantically before every lease'],
    test: [
      'node --test scripts/backlog-orchestrator/__tests__/pre-lease-gates.test.mjs',
    ],
    rollback: 'Revert the gate commit and remove the receipt comments',
  };
}

/** Injected GBrain double matching the context-gate client contract. */
function fakeGbrain({
  orgChartTruth = 'implementation owner: Symphony',
  fail = false,
} = {}) {
  return {
    async getPage(slug) {
      if (fail) throw new Error('gbrain unreachable');
      if (slug !== contextGate.ORG_CHART_SLUG) return null;
      return {
        slug,
        id: 'page-org-chart',
        revision: 'rev-1',
        compiledTruth: orgChartTruth,
      };
    },
    async searchPages() {
      if (fail) throw new Error('gbrain unreachable');
      return [{ slug: 'notes/example', id: 'page-1', revision: 'rev-1' }];
    },
  };
}

/** Stateful Linear double: mutations mutate, rereads observe. */
function fakeLinearClient(initialIssue) {
  let current = initialIssue;
  const labelNames = new Map(
    (initialIssue.labels?.nodes || []).map(label => [label.id, label.name])
  );
  return {
    get issue() {
      return current;
    },
    async addComment(id, body) {
      current = {
        ...current,
        comments: { nodes: [...current.comments.nodes, { body }] },
      };
      return { commentCreate: { success: true } };
    },
    async fetchIssue() {
      return current;
    },
    async fetchTeamLabel(teamId, name) {
      const id = `${name}-id`;
      labelNames.set(id, name);
      return { id, name };
    },
    async setIssueLabels(id, labelIds) {
      current = {
        ...current,
        labels: {
          nodes: labelIds.map(labelId => ({
            id: labelId,
            name: labelNames.get(labelId) || labelId,
          })),
        },
      };
      return { issueUpdate: { success: true } };
    },
    async transitionIssue(id, stateId) {
      current = {
        ...current,
        state: { id: stateId, name: 'Todo', type: 'unstarted' },
      };
      return { issueUpdate: { success: true } };
    },
  };
}

describe('symphony-context/v1', () => {
  it('turns a GBrain outage into a typed system-blocker before lease', async () => {
    const candidate = issue();
    const result = await contextGate.approveContext({
      issue: candidate,
      gbrain: fakeGbrain({ fail: true }),
      client: fakeLinearClient(candidate),
      now: NOW,
    });
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason, 'gbrain-unavailable');

    // And the lease boundary fails closed without the receipt.
    assert.equal(
      admissionGate.validateAdmissionCandidate(candidate, { now: NOW }),
      'context-receipt-missing-or-invalid'
    );
  });

  it('blocks the lease when the org chart declares another implementation owner', async () => {
    const candidate = issue();
    const result = await contextGate.approveContext({
      issue: candidate,
      gbrain: fakeGbrain({
        orgChartTruth: 'implementation owner: Gem\nverification owner: Gem',
      }),
      client: fakeLinearClient(candidate),
      now: NOW,
    });
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason, 'ownership-conflict');
    assert.match(result.detail, /Gem/);
  });

  it('rejects forged, mismatched, and stale context receipts', () => {
    const candidate = withPreLeaseReceipts(issue());
    const valid = contextGate.contextGateReceipt(candidate, { now: NOW });
    assert.ok(valid);

    const forged = valid.body.replace(
      /"fingerprint":"[a-f0-9]+"/,
      '"fingerprint":"forged"'
    );
    assert.equal(
      contextGate.contextGateReceipt(
        issue({ comments: { nodes: [{ body: forged }] } }),
        { now: NOW }
      ),
      null
    );

    const stale = withPreLeaseReceipts(issue(), {
      now: '2020-01-01T00:00:00.000Z',
    });
    assert.equal(contextGate.contextGateReceipt(stale, { now: NOW }), null);
  });
});

describe('symphony-research/v1', () => {
  it('classifies purely local work as not-required with an explicit rationale', async () => {
    const candidate = issue();
    const need = researchGate.classifyResearchNeed(candidate);
    assert.equal(need.decision, 'not-required');
    assert.match(need.rationale, /purely local/);

    const client = fakeLinearClient(candidate);
    const result = await researchGate.approveResearch({
      issue: candidate,
      evidence: researchEvidenceFor(candidate, { now: NOW }),
      client,
      now: NOW,
    });
    assert.equal(result.status, 'approved');
    assert.ok(
      researchGate.researchGateReceipt(client.issue, { now: NOW }),
      'receipt revalidates after the authoritative reread'
    );
  });

  it('rejects research-required issues without bounded cited evidence', async () => {
    const candidate = researchRequiredIssue();
    const need = researchGate.classifyResearchNeed(candidate);
    assert.equal(need.decision, 'required');
    assert.match(need.rationale, /primary-source/);

    const client = fakeLinearClient(candidate);
    const missing = await researchGate.approveResearch({
      issue: candidate,
      evidence: researchEvidenceFor(candidate, { now: NOW }),
      client,
      now: NOW,
    });
    assert.equal(missing.status, 'rejected');
    assert.equal(missing.reason, 'research-queries-missing');

    const uncited = await researchGate.approveResearch({
      issue: candidate,
      evidence: researchEvidenceFor(candidate, {
        now: NOW,
        queries: researchGate.buildResearchQueries(candidate),
      }),
      client,
      now: NOW,
    });
    assert.equal(uncited.status, 'rejected');
    assert.equal(uncited.reason, 'research-citation-missing');
  });

  it('rejects stale citations and accepts dated primary-source evidence', async () => {
    const candidate = researchRequiredIssue();
    const base = {
      now: NOW,
      queries: researchGate.buildResearchQueries(candidate),
      findings: ['The vendor documents the breaking change for this upgrade.'],
    };
    const stale = researchEvidenceFor(candidate, {
      ...base,
      citations: [
        {
          url: 'https://docs.example.com/changelog',
          title: 'Vendor changelog',
          accessedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    assert.equal(
      researchGate.validateResearchEvidence(candidate, stale, { now: NOW }),
      'research-citation-stale'
    );

    const fresh = researchEvidenceFor(candidate, {
      ...base,
      citations: [
        {
          url: 'https://docs.example.com/changelog',
          title: 'Vendor changelog',
          accessedAt: NOW,
        },
      ],
    });
    const client = fakeLinearClient(candidate);
    const result = await researchGate.approveResearch({
      issue: candidate,
      evidence: fresh,
      client,
      now: NOW,
    });
    assert.equal(result.status, 'approved');
    assert.ok(researchGate.researchGateReceipt(client.issue, { now: NOW }));
  });
});

describe('pre-lease admission-to-draft flow', () => {
  it('binds context and research fingerprints through plan, admission, and lease', async () => {
    const candidate = issue();
    const client = fakeLinearClient(candidate);

    const context = await contextGate.approveContext({
      issue: candidate,
      gbrain: fakeGbrain(),
      client,
      now: NOW,
    });
    assert.equal(context.status, 'approved');

    const research = await researchGate.approveResearch({
      issue: client.issue,
      evidence: researchEvidenceFor(client.issue, { now: NOW }),
      client,
      now: NOW,
    });
    assert.equal(research.status, 'approved');

    const plan = await planGate.approvePlan({
      issue: client.issue,
      evidence: planEvidence(),
      client,
      now: NOW,
    });
    assert.equal(plan.status, 'approved');
    const planPayload = JSON.parse(plan.receipt.split('\n')[1]);
    assert.equal(planPayload.contextFingerprint, context.fingerprint);
    assert.equal(planPayload.researchFingerprint, research.fingerprint);

    const admission = await admissionGate.approveAdmission({
      issue: client.issue,
      client,
      now: NOW,
    });
    assert.equal(admission.status, 'approved');

    const lease = await admitter.admitIssue({
      issue: client.issue,
      classification: {
        identifier: candidate.identifier,
        fingerprint: 'classification-fingerprint',
        labels: { nodes: [] },
      },
      client,
      now: NOW,
    });
    assert.equal(lease.status, 'admitted');
    assert.equal(client.issue.state.name, 'Todo');

    const leasePayload = JSON.parse(
      lease.receipt
        .replace(admitter.ADMISSION_RECEIPT_PREFIX, '')
        .replace(/ -->$/, '')
    );
    assert.equal(leasePayload.contextFingerprint, context.fingerprint);
    assert.equal(leasePayload.researchFingerprint, research.fingerprint);
  });

  it('fails closed at every gate when the pre-lease receipts are missing', async () => {
    const candidate = issue();
    const client = fakeLinearClient(candidate);

    const plan = await planGate.approvePlan({
      issue: candidate,
      evidence: planEvidence(),
      client,
      now: NOW,
    });
    assert.equal(plan.status, 'rejected');
    assert.equal(plan.reason, 'context-receipt-missing-or-invalid');

    const lease = await admitter.admitIssue({
      issue: candidate,
      classification: {
        identifier: candidate.identifier,
        fingerprint: 'classification-fingerprint',
        labels: {
          nodes: [{ name: 'plan-approved' }, { name: 'admission-approved' }],
        },
      },
      client,
      now: NOW,
    });
    assert.equal(lease.status, 'rejected');
    assert.equal(lease.reason, 'context-receipt-missing-or-invalid');
  });
});
