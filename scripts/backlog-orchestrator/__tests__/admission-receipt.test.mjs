import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as admissionGate from '../admission-gate.mjs';
import * as admitter from '../admitter.mjs';
import * as deterministicGates from '../deterministic-gates.mjs';
import { withFullGateReceipts, withPreLeaseReceipts } from './pre-lease.mjs';

const NOW = new Date().toISOString();

function issue(overrides = {}) {
  return {
    id: 'issue-id',
    identifier: 'JOV-5121',
    title: 'Replace Symphony triple manual labels',
    description: `## Problem
Triple labels block idle hosts.

## Proposed fix
Use one revision-scoped admission receipt.

- target_system: jovie-product
- target_repo: JovieInc/Jovie
- artifact: scripts/backlog-orchestrator/admission-gate.mjs
- verification_authority: JovieInc/Jovie CI

## Optimization exception
- Class: non-product
- Justification: This control-plane admission receipt ships no user-facing page, link, asset, campaign, recommendation, or content variant.

## Acceptance criteria
* Receipts admit work without the three labels.
* Protected work stays excluded.`,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    priority: 2,
    estimate: 2,
    state: { name: 'Todo' },
    assignee: null,
    labels: { nodes: [] },
    children: { nodes: [] },
    comments: { nodes: [] },
    ...overrides,
  };
}

function admitted(overrides = {}) {
  return withFullGateReceipts(issue(overrides), { now: NOW });
}

function clientFor(issue, { labels = [] } = {}) {
  let current = issue;
  const calls = { comments: 0, labels: 0, reads: 0 };
  return {
    calls,
    async addComment(_id, body) {
      calls.comments += 1;
      current = {
        ...current,
        comments: {
          nodes: [...(current.comments?.nodes || []), { body }],
        },
      };
      return { commentCreate: { success: true } };
    },
    async fetchIssue() {
      calls.reads += 1;
      return current;
    },
    async fetchTeamLabel(_teamId, name) {
      return { id: `${name}-id`, name };
    },
    async setIssueLabels(_id, labelIds) {
      calls.labels += 1;
      const next = [
        ...(current.labels?.nodes || []),
        ...labels
          .concat(labelIds.map(id => ({ id, name: id.replace(/-id$/, '') })))
          .filter(
            (label, index, all) =>
              all.findIndex(item => item.id === label.id) === index
          ),
      ];
      current = { ...current, labels: { nodes: next } };
      return { issueUpdate: { success: true } };
    },
  };
}

describe('revision-scoped admission receipt', () => {
  it('admits from the receipt without the triple labels', () => {
    const candidate = admitted();
    assert.equal(admissionGate.validateAdmissionCandidate(candidate), null);
    assert.ok(admissionGate.admissionGateReceipt(candidate, { now: NOW }));
    assert.equal(admitter.hasAdmissionEvidence(candidate).eligible, true);
    assert.deepEqual(admitter.hasAdmissionEvidence(candidate).derivedLabels, {
      planApproved: false,
      admissionApproved: false,
      symphony: false,
    });
    assert.deepEqual(deterministicGates.admissionIntentLoad([candidate]), {
      count: 1,
      identifiers: ['JOV-5121'],
    });
  });

  it('treats the three labels as derived audit, not independent blockers', () => {
    const unlabeled = admitted();
    const labeled = admitted({
      labels: {
        nodes: [
          { name: 'plan-approved' },
          { name: 'admission-approved' },
          { name: 'symphony' },
        ],
      },
    });
    assert.equal(
      deterministicGates.admissionIntentLoad([unlabeled]).count,
      deterministicGates.admissionIntentLoad([labeled]).count
    );
    assert.equal(admitter.hasAdmissionEvidence(unlabeled).eligible, true);
    assert.equal(admitter.hasAdmissionEvidence(labeled).eligible, true);
    assert.equal(
      deterministicGates.validateDeterministicPlanCandidate(
        issue({
          labels: { nodes: [{ name: 'symphony' }] },
        })
      ),
      null
    );
  });

  it('rejects a stale receipt after the issue revision changes', () => {
    const original = admitted();
    const receipt = admissionGate.admissionGateReceipt(original, { now: NOW });
    assert.ok(receipt);
    const edited = {
      ...original,
      title: `${original.title} — edited`,
    };
    assert.equal(
      admissionGate.admissionGateReceipt(edited, { now: NOW }),
      null
    );
    assert.equal(admitter.hasAdmissionEvidence(edited).eligible, false);
    assert.deepEqual(deterministicGates.admissionIntentLoad([edited]), {
      count: 0,
      identifiers: [],
    });
  });

  it('rejects stale unscoped admission receipts that omit repository target fields', () => {
    const original = admitted();
    const body = admissionGate.buildAdmissionGateReceipt(original, {
      now: NOW,
    });
    const payload = JSON.parse(body.split('\n')[1]);
    for (const field of [
      'target_system',
      'target_repo',
      'artifact',
      'verification_authority',
    ]) {
      delete payload[field];
    }
    const unscoped = `${admissionGate.ADMISSION_GATE_PREFIX}\n${JSON.stringify(payload)}\n${admissionGate.ADMISSION_GATE_SUFFIX}`;
    const candidate = {
      ...original,
      comments: { nodes: [{ body: unscoped }] },
    };
    assert.equal(
      admissionGate.admissionGateReceipt(candidate, { now: NOW }),
      null
    );
    assert.equal(admitter.hasAdmissionEvidence(candidate).eligible, false);
  });

  it('keeps admission live when legacy human or taste labels appear', () => {
    for (const label of [
      'human-review-required',
      'needs-human',
      'needs:taste',
      'needs-human-taste',
      'no-auto',
    ]) {
      const labeledIssue = admitted({
        labels: { nodes: [{ name: label }] },
      });
      assert.equal(
        admissionGate.validateAdmissionCandidate(labeledIssue),
        null
      );
      assert.notEqual(
        admissionGate.admissionGateReceipt(labeledIssue, { now: NOW }),
        null
      );
      assert.equal(admitter.hasAdmissionEvidence(labeledIssue).eligible, true);
      assert.deepEqual(deterministicGates.admissionIntentLoad([labeledIssue]), {
        count: 1,
        identifiers: [labeledIssue.identifier],
      });
    }
  });

  it('recovers a missing derived label from an existing receipt', async () => {
    const original = admitted();
    const receipt = admissionGate.buildAdmissionGateReceipt(original, {
      now: NOW,
    });
    const fake = clientFor(original);
    const first = await admissionGate.approveAdmission({
      issue: original,
      client: fake,
      teamId: 'team-id',
      now: NOW,
    });
    assert.equal(first.status, 'already-approved');
    assert.equal(fake.calls.comments, 0);
    assert.equal(fake.calls.labels, 1);
    assert.ok(
      fake.calls.reads >= 1
        ? (await fake.fetchIssue()).labels.nodes.some(
            label => label.name === 'admission-approved'
          )
        : true
    );

    const again = await admissionGate.approveAdmission({
      issue: await fake.fetchIssue(),
      client: fake,
      teamId: 'team-id',
      now: NOW,
    });
    assert.equal(again.status, 'already-approved');
    assert.equal(again.receipt, receipt);
    assert.equal(fake.calls.comments, 0);
  });

  it('writes the receipt once and does not require a plan label first', async () => {
    const planned = withPreLeaseReceipts(issue(), { now: NOW });
    const { evidence } =
      deterministicGates.buildDeterministicPlanEvidence(planned);
    const planReceipt = (await import('../plan-gate.mjs')).buildPlanGateReceipt(
      planned,
      evidence,
      { now: NOW }
    );
    const ready = {
      ...planned,
      comments: {
        nodes: [...planned.comments.nodes, { body: planReceipt }],
      },
    };
    assert.equal(admissionGate.validateAdmissionCandidate(ready), null);
    const fake = clientFor(ready);
    const result = await admissionGate.approveAdmission({
      issue: ready,
      client: fake,
      teamId: 'team-id',
      now: NOW,
    });
    assert.equal(result.status, 'approved');
    assert.equal(fake.calls.comments, 1);
    assert.match(result.receipt, /"issueRevision":"/);
    assert.equal(
      JSON.parse(result.receipt.split('\n')[1]).issueRevision,
      admissionGate.admissionIssueRevision(ready)
    );
  });
});
