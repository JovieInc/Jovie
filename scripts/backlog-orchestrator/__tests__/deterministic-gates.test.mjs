import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as admissionGate from '../admission-gate.mjs';
import * as deterministicGates from '../deterministic-gates.mjs';
import * as planGate from '../plan-gate.mjs';

function issue(overrides = {}) {
  return {
    id: 'issue-id',
    identifier: 'JOV-4305',
    title: 'Normalize one Sentry fingerprint',
    description: `## Problem
One deterministic alert fingerprint fans out.

## Proposed fix
Normalize the unstable token before sending the event.

## Acceptance criteria
* Repeated events group into one issue.
* Focused normalizer tests pass.`,
    createdAt: '2026-08-01T00:00:00.000Z',
    priority: 2,
    estimate: 2,
    state: { name: 'Backlog' },
    project: { name: 'Infra & CI/CD' },
    assignee: null,
    labels: {
      nodes: [
        { id: 'ready-id', name: 'ready-for-intake' },
        { id: 'testing-id', name: 'testing' },
      ],
    },
    children: { nodes: [] },
    comments: { nodes: [] },
    ...overrides,
  };
}

function plannedIssue(overrides = {}) {
  const base = issue();
  const { evidence } = deterministicGates.buildDeterministicPlanEvidence(base);
  const receipt = planGate.buildPlanGateReceipt(base, evidence);
  return issue({
    labels: {
      nodes: [
        ...base.labels.nodes,
        { id: 'plan-id', name: planGate.PLAN_APPROVED_LABEL },
      ],
    },
    comments: { nodes: [{ body: receipt }] },
    ...overrides,
  });
}

describe('deterministic no-model gates', () => {
  it('builds complete bounded plan evidence only from an allowlisted issue', () => {
    const result = deterministicGates.buildDeterministicPlanEvidence(issue());
    assert.equal(result.reason, null);
    assert.equal(result.evidence.repo, 'JovieInc/Jovie');
    assert.equal(result.evidence.project, 'Infra & CI/CD');
    assert.deepEqual(result.evidence.acceptance, [
      'Repeated events group into one issue.',
      'Focused normalizer tests pass.',
    ]);
    assert.equal(planGate.validatePlanCandidate(issue(), result.evidence), null);
  });

  it('fails closed on project, ownership, epic, sensitive, stale, and incomplete work', () => {
    const cases = [
      issue({ project: { name: 'LogYourBody' } }),
      issue({ assignee: { id: 'tim', name: 'Tim White' } }),
      issue({ labels: { nodes: [{ name: 'type:epic' }] } }),
      issue({ title: 'Rotate a production credential' }),
      issue({ createdAt: '2025-01-01T00:00:00.000Z' }),
      issue({ description: 'No structured acceptance section' }),
    ];
    for (const candidate of cases) {
      assert.notEqual(
        deterministicGates.validateDeterministicPlanCandidate(candidate, {
          now: '2026-08-05T00:00:00.000Z',
        }),
        null
      );
    }
  });

  it('selects exactly one eligible issue deterministically', () => {
    const result = deterministicGates.selectDeterministicPlanCandidate(
      [
        issue({ identifier: 'JOV-4304', priority: 3 }),
        issue({ identifier: 'JOV-4305', priority: 2 }),
      ],
      { now: '2026-08-05T00:00:00.000Z' }
    );
    assert.equal(result.selected.identifier, 'JOV-4305');
  });

  it('materializes admission receipt and label with authoritative rereads', async () => {
    const original = plannedIssue();
    const receipt = admissionGate.buildAdmissionGateReceipt(original);
    const afterReceipt = plannedIssue({
      comments: {
        nodes: [...original.comments.nodes, { body: receipt }],
      },
    });
    const afterLabel = plannedIssue({
      labels: {
        nodes: [
          ...original.labels.nodes,
          { id: 'admission-id', name: 'admission-approved' },
        ],
      },
      comments: afterReceipt.comments,
    });
    const reads = [afterReceipt, afterLabel, afterLabel];
    const calls = { comments: 0, labels: 0, reads: 0 };
    const client = {
      async addComment() {
        calls.comments += 1;
        return { commentCreate: { success: true } };
      },
      async fetchIssue() {
        calls.reads += 1;
        return reads.shift();
      },
      async fetchTeamLabel() {
        return { id: 'admission-id', name: 'admission-approved' };
      },
      async setIssueLabels() {
        calls.labels += 1;
        return { issueUpdate: { success: true } };
      },
    };
    const result = await admissionGate.approveAdmission({
      issue: original,
      client,
      teamId: 'team-id',
    });
    assert.equal(result.status, 'approved');
    assert.deepEqual(calls, { comments: 1, labels: 1, reads: 3 });
  });

  it('counts an admitted intent before Symphony starts work', () => {
    const base = plannedIssue();
    const gateReceipt = admissionGate.buildAdmissionGateReceipt(base);
    const admitted = plannedIssue({
      state: { name: 'Todo' },
      labels: {
        nodes: [
          ...base.labels.nodes,
          { id: 'admission-id', name: 'admission-approved' },
          { id: 'symphony-id', name: 'symphony' },
        ],
      },
      comments: {
        nodes: [...base.comments.nodes, { body: gateReceipt }],
      },
    });
    assert.deepEqual(deterministicGates.admissionIntentLoad([admitted]), {
      count: 1,
      identifiers: ['JOV-4305'],
    });
  });
});
