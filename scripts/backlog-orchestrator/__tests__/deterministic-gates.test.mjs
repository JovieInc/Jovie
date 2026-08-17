import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as admissionGate from '../admission-gate.mjs';
import * as admitter from '../admitter.mjs';
import * as deterministicGates from '../deterministic-gates.mjs';
import * as planGate from '../plan-gate.mjs';
import { withPreLeaseReceipts } from './pre-lease.mjs';

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
    project: { name: 'Infra & CI/CD', slugId: '82c6fbd42405' },
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
  const seed = {};
  if (overrides.identifier !== undefined)
    seed.identifier = overrides.identifier;
  if (overrides.project !== undefined) seed.project = overrides.project;
  const base = withPreLeaseReceipts(issue(seed));
  const { evidence } = deterministicGates.buildDeterministicPlanEvidence(base);
  const receipt = planGate.buildPlanGateReceipt(base, evidence);
  return issue({
    ...overrides,
    labels: overrides.labels || {
      nodes: [
        ...base.labels.nodes,
        { id: 'plan-id', name: planGate.PLAN_APPROVED_LABEL },
      ],
    },
    comments: overrides.comments || {
      nodes: [...base.comments.nodes, { body: receipt }],
    },
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
    assert.equal(
      planGate.validatePlanCandidate(issue(), result.evidence),
      null
    );
  });

  it('accepts agent-ready as durable evidence without requiring more labels', () => {
    const candidate = issue({
      labels: { nodes: [{ id: 'agent-ready-id', name: 'agent-ready' }] },
    });
    assert.equal(
      deterministicGates.validateDeterministicPlanCandidate(candidate),
      null
    );
  });

  it('does not require a human readiness label for ordinary safe work', () => {
    const candidate = issue({
      labels: { nodes: [] },
    });
    assert.equal(
      deterministicGates.validateDeterministicPlanCandidate(candidate),
      null
    );
  });

  it('routes LYB evidence to LogYourBody without requiring a Linear project', () => {
    const candidate = issue({
      identifier: 'LYB-12',
      project: null,
    });
    const result = deterministicGates.buildDeterministicPlanEvidence(candidate);
    assert.equal(result.reason, null);
    assert.equal(result.evidence.repo, 'JovieInc/LogYourBody');
    assert.equal(result.evidence.project, 'LYB');
    assert.equal(admitter.isConcreteJovieIssue(candidate), true);
    assert.equal(
      planGate.validatePlanCandidate(candidate, result.evidence),
      null
    );
    assert.equal(
      admissionGate.validateAdmissionCandidate(
        plannedIssue({
          identifier: 'LYB-12',
          project: null,
        })
      ),
      null
    );
  });

  it('accepts equivalent bold scope and acceptance sections used by LYB', () => {
    const candidate = issue({
      identifier: 'LYB-13',
      project: null,
      description: `**Problem** — The gesture uses the wrong denominator.

**Proposed fix** — Divide by the rendered track width and clamp the result.

**Acceptance** — Drag positions map linearly from zero to one.`,
    });
    const result = deterministicGates.buildDeterministicPlanEvidence(candidate);
    assert.equal(result.reason, null);
    assert.match(result.evidence.scope, /rendered track width/);
    assert.deepEqual(result.evidence.acceptance, [
      'Drag positions map linearly from zero to one.',
    ]);
  });

  it('fails closed on team routing, ownership, epic, sensitive, stale, and incomplete work', () => {
    const cases = [
      issue({ identifier: 'OPS-1' }),
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

  it('rejects every explicit human hold before plan or admission approval', () => {
    for (const label of [
      'needs-human',
      'held',
      'decision-required',
      'manual-incident',
    ]) {
      const candidate = issue({ labels: { nodes: [{ name: label }] } });
      assert.equal(
        deterministicGates.validateDeterministicPlanCandidate(candidate),
        'protected-or-human-review'
      );
      assert.equal(
        admissionGate.validateAdmissionCandidate(
          plannedIssue({ labels: { nodes: [{ name: label }] } })
        ),
        'protected-or-human-review'
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
