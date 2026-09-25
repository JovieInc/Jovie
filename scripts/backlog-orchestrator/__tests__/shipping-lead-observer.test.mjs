import assert from 'node:assert/strict';
import test from 'node:test';
import { SHIPPING_TASK } from '../../symphony/summer-shipping-lead-contract.mjs';
import { buildAdmissionReceipt } from '../admitter.mjs';
import { readShippingLeadIssue } from '../shipping-lead-observer.mjs';

function fixture() {
  const createdAt = new Date(Date.now() - 1000).toISOString();
  return {
    schema: SHIPPING_TASK,
    taskKey: 'a'.repeat(64),
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + 600_000).toISOString(),
    owner: 'symphony',
    route: 'symphony',
    action: 'request-canonical-jov-triage-admission',
    authority: 'canonical-admission-request-owner-acceptance-required',
    safety: 'exact-source-ci-native-queue-production-gates-remain-required',
    maximumConcurrent: 3,
    handoffReceiptId: 'b'.repeat(64),
    issue: {
      identifier: 'JOV-6586',
      id: '00000000-0000-4000-8000-000000006586',
      revision: createdAt,
      state: 'Triage',
      repository: 'JovieInc/Jovie',
    },
    selected: {
      id: 'shipping-lead-jov-triage',
      sourceRevision: 'c'.repeat(40),
      sourceDigest: 'd'.repeat(64),
      owner: 'symphony',
      handle: 'JOV-6586',
    },
    source: { sourceVersion: 'c'.repeat(40), snapshotDigest: 'e'.repeat(64) },
    runtime: {
      sourceRevision: 'f'.repeat(40),
      generation: '1'.repeat(64),
      invocationId: '2'.repeat(32),
    },
  };
}

function setup() {
  const task = fixture();
  const issue = {
    id: task.issue.id,
    identifier: task.issue.identifier,
    title: 'Bounded implementation',
    description:
      '- target_system: jovie-product\n- target_repo: JovieInc/Jovie\n- artifact: scripts/backlog-orchestrator/admission-gate.mjs\n- verification_authority: JovieInc/Jovie CI',
    labels: { nodes: [] },
    state: { name: 'In Progress' },
    comments: { nodes: [], pageInfo: { hasNextPage: false } },
  };
  const lease = buildAdmissionReceipt(issue, {
    now: task.createdAt,
    fingerprint: task.taskKey,
  });
  issue.comments.nodes.push({ body: lease });
  const client = {
    fetchIssue: async (identifier, options) => {
      assert.deepEqual(options, { includeAdmissionEvidence: true });
      assert.equal(identifier, task.issue.identifier);
      return issue;
    },
  };
  return { task, issue, lease, client };
}
test('read-only canonical observation binds existing lease and ignores unrelated comments', async () => {
  const f = setup();
  f.issue.comments.nodes.push(
    { body: 'untrusted irrelevant comment' },
    { body: f.lease }
  );
  const result = await readShippingLeadIssue(f.task, f);
  assert.equal(result.issueId, f.task.issue.id);
  assert.equal(result.admittedAt, f.task.createdAt);
  assert.match(result.leaseDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.state, 'In Progress');
  f.issue.state = undefined;
  assert.equal((await readShippingLeadIssue(f.task, f)).state, null);
});
test('missing issue, wrong identity, missing lease, ambiguity or invalid lease timing hold', async () => {
  for (const change of [
    f => {
      f.issue.id = 'other';
    },
    f => {
      f.issue.identifier = 'JOV-1';
    },
    f => {
      f.issue.comments = undefined;
    },
    f => {
      f.issue.comments.nodes = [];
    },
    f => {
      f.issue.comments.nodes = [
        { body: f.lease.replace(f.task.taskKey, '9'.repeat(64)) },
      ];
    },
    f => {
      f.issue.comments.nodes = [
        { body: f.lease.replace(f.task.createdAt, 'bad') },
      ];
    },
    f => {
      f.issue.comments.nodes = [
        { body: f.lease.replace(f.task.createdAt, '2020-01-01T00:00:00Z') },
      ];
    },
    f => {
      f.issue.comments.nodes = [
        { body: f.lease.replace(f.task.createdAt, '2099-01-01T00:00:00Z') },
      ];
    },
    f => {
      f.issue.comments.nodes.push({
        body: f.lease.replace(f.task.createdAt, f.task.expiresAt),
      });
    },
  ]) {
    const f = setup();
    change(f);
    await assert.rejects(readShippingLeadIssue(f.task, f), /shipping-lead-/);
  }
  const f = setup();
  f.client.fetchIssue = async () => null;
  await assert.rejects(readShippingLeadIssue(f.task, f), /issue-mismatch/);
});

test('newer or simultaneous different leases cannot reuse a prior task acceptance', async () => {
  for (const at of [null, 'later', 'bad']) {
    const f = setup();
    const timestamp =
      at === 'later'
        ? f.task.expiresAt
        : at === 'bad'
          ? 'bad'
          : f.task.createdAt;
    f.issue.comments.nodes.push({
      body: f.lease
        .replace(f.task.taskKey, '9'.repeat(64))
        .replace(f.task.createdAt, timestamp),
    });
    await assert.rejects(readShippingLeadIssue(f.task, f), /lease-superseded/);
  }
  const f = setup();
  f.issue.comments.nodes.push({
    body: f.lease
      .replace(f.task.taskKey, '9'.repeat(64))
      .replace(f.task.createdAt, '2020-01-01T00:00:00Z'),
  });
  assert.equal(
    (await readShippingLeadIssue(f.task, f)).admittedAt,
    f.task.createdAt
  );
});

test('truncated, missing or malformed pagination cannot hide a superseding lease', async () => {
  for (const pageInfo of [
    undefined,
    {},
    { hasNextPage: true },
    { hasNextPage: 'false' },
  ]) {
    const f = setup();
    Reflect.set(f.issue.comments, 'pageInfo', pageInfo);
    await assert.rejects(readShippingLeadIssue(f.task, f), /lease-incomplete/);
  }
});
