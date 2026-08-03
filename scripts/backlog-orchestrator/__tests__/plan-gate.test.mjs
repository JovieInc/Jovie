import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const planGate = await import('../plan-gate.mjs');

function issue(overrides = {}) {
  return {
    id: 'issue-id',
    identifier: 'JOV-900',
    title: 'Bounded fix',
    state: { name: 'Triage', type: 'triage' },
    assignee: null,
    labels: { nodes: [] },
    pullRequestUrl: null,
    comments: { nodes: [] },
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    verified: true,
    concrete: true,
    bounded: true,
    repo: 'JovieInc/Jovie',
    project: 'Jovie',
    owner: 'machine-agent',
    scope: 'Change one control-plane module and its focused tests',
    acceptance: ['The approved receipt is written exactly once'],
    test: [
      'node --test scripts/backlog-orchestrator/__tests__/plan-gate.test.mjs',
    ],
    rollback: 'Revert the plan-gate commit and remove the receipt comment',
    ...overrides,
  };
}

function client({ rereads = [], addCommentError = null } = {}) {
  const queue = [...rereads];
  const calls = { addComment: [], fetchIssue: 0 };
  return {
    calls,
    async addComment(id, body) {
      calls.addComment.push({ id, body });
      if (addCommentError) throw addCommentError;
      return { commentCreate: { success: true } };
    },
    async fetchIssue() {
      calls.fetchIssue += 1;
      return queue.shift();
    },
  };
}

describe('plan-gate/v1', () => {
  it('approves a verified concrete bounded issue and verifies the receipt by reread', async () => {
    const original = issue();
    const receipt = planGate.buildPlanGateReceipt(original, evidence());
    const after = issue({ comments: { nodes: [{ body: receipt }] } });
    const fake = client({ rereads: [after] });

    const result = await planGate.approvePlan({
      issue: original,
      evidence: evidence(),
      client: fake,
    });

    assert.equal(result.status, 'approved');
    assert.equal(result.receipt, receipt);
    assert.match(receipt, /<!-- plan-gate\/v1 -->/);
    assert.equal(fake.calls.addComment.length, 1);
    assert.equal(fake.calls.fetchIssue, 1);
  });

  it('is an idempotent no-op for the same stable receipt', async () => {
    const original = issue();
    const receipt = planGate.buildPlanGateReceipt(original, evidence());
    const fake = client();
    const result = await planGate.approvePlan({
      issue: issue({ comments: { nodes: [{ body: receipt }] } }),
      evidence: evidence(),
      client: fake,
    });

    assert.equal(result.status, 'already-approved');
    assert.equal(result.receipt, receipt);
    assert.deepEqual(fake.calls.addComment, []);
    assert.equal(fake.calls.fetchIssue, 0);
  });

  it('fails closed for invalid, protected, synthetic, ambiguous, closed, and active-PR candidates', async () => {
    const cases = [
      ['unverified', {}, { verified: false }],
      ['Tim-owned', { assignee: { id: 'tim', name: 'Tim White' } }, {}],
      ['protected', { labels: { nodes: [{ name: 'needs-human' }] } }, {}],
      ['credential', { title: 'Rotate API credential' }, {}],
      ['synthetic', { labels: { nodes: [{ name: 'synthetic' }] } }, {}],
      ['ambiguous', { state: { name: 'In Progress' } }, {}],
      ['closed', { state: { name: 'Done', type: 'completed' } }, {}],
      [
        'active PR',
        { pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/1' },
        {},
      ],
    ];

    for (const [rawName, overrides, evidenceOverrides] of cases) {
      const name = String(rawName);
      const fake = client();
      const result = await planGate.approvePlan({
        issue: issue(overrides),
        evidence: evidence(evidenceOverrides),
        client: fake,
      });
      assert.equal(result.status, 'rejected', name);
      assert.equal(fake.calls.addComment.length, 0, name);
    }
  });

  it('rejects incomplete evidence without mutating Linear', async () => {
    const fake = client();
    const result = await planGate.approvePlan({
      issue: issue(),
      evidence: evidence({ rollback: '' }),
      client: fake,
    });
    assert.equal(result.status, 'rejected');
    assert.match(result.reason, /rollback/);
    assert.equal(fake.calls.addComment.length, 0);
  });

  it('propagates transport failure as a blocked operation', async () => {
    const fake = client({ addCommentError: new Error('network down') });
    await assert.rejects(
      planGate.approvePlan({
        issue: issue(),
        evidence: evidence(),
        client: fake,
      }),
      /network down/
    );
    assert.equal(fake.calls.fetchIssue, 0);
  });
});
