import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReviewedPlanReview,
  gateShippingLeadRequest,
  materializeReviewedPlanAdmission,
  reviewedPlanDecisionReceipt,
} from '../shipping-lead-gate.mjs';
import { withPreLeaseReceipts } from './pre-lease.mjs';

function setup() {
  const time = Date.now();
  const createdAt = new Date(time - 1000).toISOString();
  const task = {
    schema: 'jovie-symphony-shipping-lead-task/v1',
    taskKey: 'a'.repeat(64),
    createdAt,
    expiresAt: new Date(time + 120000).toISOString(),
    owner: 'symphony',
    route: 'symphony',
    action: 'request-canonical-jov-triage-admission',
    authority: 'canonical-admission-request-owner-acceptance-required',
    safety: 'exact-source-ci-native-queue-production-gates-remain-required',
    maximumConcurrent: 3,
    handoffReceiptId: 'b'.repeat(64),
    issue: {
      id: '00000000-0000-4000-8000-000000006586',
      identifier: 'JOV-6586',
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
  let issue = {
    id: task.issue.id,
    identifier: task.issue.identifier,
    title: 'Bounded change',
    description: 'Existing plan',
    updatedAt: createdAt,
    state: { name: 'Triage' },
    assignee: null,
  };
  const events = [];
  const deps = {
    now: () => time,
    team: { key: 'JOV', todoStateId: 'todo-id' },
    client: {
      fetchIssue: async () => structuredClone(issue),
      addComment: async (id, text) => {
        events.push(['comment', id, text]);
        return { success: true };
      },
      setIssueLabels: async (id, labels) => {
        events.push(['labels', id, labels]);
        return { success: true };
      },
      transitionIssue: async (id, state) => {
        events.push(['transition', id, state]);
        issue.state.name = 'Todo';
        return { issueUpdate: { success: true } };
      },
    },
    preflight: async () => ({ open: true, load: { count: 2 }, reason: 'open' }),
    beforeMutation: async value => {
      events.push(['intent', value.method]);
    },
    /** @returns {Promise<{status: string} | void>} */
    evaluate: async (team, selected, dryRun, preflight, stale, options) => {
      assert.equal(selected.id, task.issue.id);
      assert.equal(stale, null);
      assert.equal(options.fingerprint, task.taskKey);
      assert.equal(preflight.open, true);
      return { status: 'would-admit' };
    },
  };
  return {
    task,
    deps,
    events,
    issue: () => issue,
    change: value => {
      issue = { ...issue, ...value };
    },
  };
}

test('binds only the requested issue to the canonical pipeline and fingerprint', async () => {
  const f = setup();
  assert.equal(
    (await gateShippingLeadRequest(f.task, f.deps)).status,
    'would-admit'
  );
  assert.deepEqual(f.events, []);
});
for (const field of ['id', 'identifier', 'updatedAt', 'state', 'assignee']) {
  test(`holds stale or owned issue field ${field} before any evaluation`, async () => {
    const f = setup();
    f.change({ [field]: 'different' });
    assert.equal(
      (await gateShippingLeadRequest(f.task, f.deps)).reason,
      'shipping-lead-issue-changed-or-owned'
    );
    assert.deepEqual(f.events, []);
  });
}
test('requires a durable mutation journal, exact team, and fresh signed request', async () => {
  const f = setup();
  assert.equal(
    (await gateShippingLeadRequest(f.task, { ...f.deps, beforeMutation: null }))
      .reason,
    'shipping-lead-mutation-journal-unavailable'
  );
  assert.equal(
    (await gateShippingLeadRequest(f.task, { ...f.deps, team: { key: 'LYB' } }))
      .reason,
    'shipping-lead-team-mismatch'
  );
  assert.equal(
    (
      await gateShippingLeadRequest(f.task, {
        ...f.deps,
        now: () => Date.parse(f.task.expiresAt),
      })
    ).reason,
    'shipping-lead-request-expired-or-future'
  );
  assert.equal(
    (
      await gateShippingLeadRequest(f.task, {
        ...f.deps,
        now: () => Date.parse(f.task.createdAt) - 60001,
      })
    ).reason,
    'shipping-lead-request-expired-or-future'
  );
});
test('preserves denied, missing and full measured capacity', async () => {
  const f = setup();
  for (const result of [
    null,
    { open: false, reason: 'owner-held' },
    { open: true, load: { count: 3 } },
    { open: true, load: { count: '2' } },
  ]) {
    const observed = await gateShippingLeadRequest(f.task, {
      ...f.deps,
      preflight: async () => result,
    });
    assert.equal(observed.status, 'held');
  }
  assert.deepEqual(f.events, []);
});
test('records intent before every exact canonical mutation and permits finishing the third admission', async () => {
  const f = setup();
  f.deps.preflight = async (_team, current, options) => {
    assert.equal(
      options.excludeIssueId,
      current.state.name === 'Todo' ? f.task.issue.id : null
    );
    return { open: true, load: { count: 2 }, reason: 'open' };
  };
  f.deps.evaluate = async (_team, issue, _dry, _pre, _stale, options) => {
    await options.client.addComment(issue.id, 'canonical context receipt');
    await options.client.setIssueLabels(issue.id, ['approved-plan']);
    await options.client.transitionIssue(issue.id, 'todo-id');
    await options.client.addComment(issue.id, 'canonical lease receipt');
    return { status: 'admitted' };
  };
  assert.equal(
    (await gateShippingLeadRequest(f.task, f.deps)).status,
    'admitted'
  );
  assert.deepEqual(
    f.events.map(event => event[0]),
    [
      'intent',
      'comment',
      'intent',
      'labels',
      'intent',
      'transition',
      'intent',
      'comment',
    ]
  );
});
for (const change of [
  { assignee: { id: 'other-owner' } },
  { title: 'Changed scope' },
  { state: { name: 'In Progress' } },
]) {
  test(`rechecks ownership and scope immediately before mutation ${JSON.stringify(change)}`, async () => {
    const f = setup();
    f.deps.evaluate = async (_team, issue, _dry, _pre, _stale, options) => {
      f.change(change);
      await options.client.addComment(issue.id, 'must not write');
    };
    await assert.rejects(
      gateShippingLeadRequest(f.task, f.deps),
      /issue-changed-or-owned/
    );
    assert.deepEqual(f.events, []);
  });
}
test('owner acquisition while intent persists prevents provider mutation', async () => {
  const f = setup();
  f.deps.beforeMutation = async () => {
    f.change({ assignee: { id: 'new-owner' } });
  };
  f.deps.evaluate = async (_team, issue, _dry, _pre, _stale, options) =>
    options.client.addComment(issue.id, 'never');
  await assert.rejects(
    gateShippingLeadRequest(f.task, f.deps),
    /issue-changed-or-owned/
  );
  assert.deepEqual(f.events, []);
});
test('expiry during preparation stops the first mutation', async () => {
  const f = setup();
  let expired = false;
  f.deps.now = () =>
    expired ? Date.parse(f.task.expiresAt) : Date.parse(f.task.createdAt);
  f.deps.evaluate = async (_team, issue, _dry, _pre, _stale, options) => {
    expired = true;
    await options.client.addComment(issue.id, 'never');
  };
  await assert.rejects(
    gateShippingLeadRequest(f.task, f.deps),
    /request-expired/
  );
  assert.deepEqual(f.events, []);
});
test('prevents cross-issue and unauthorized state mutations', async () => {
  const f = setup();
  for (const [method, id, value] of [
    ['addComment', 'other-issue', 'text'],
    ['transitionIssue', f.task.issue.id, 'done-id'],
  ]) {
    f.deps.evaluate = async (_team, _issue, _dry, _pre, _stale, options) =>
      options.client[method](id, value);
    await assert.rejects(
      gateShippingLeadRequest(f.task, f.deps),
      /mutation-target-mismatch/
    );
  }
  assert.deepEqual(f.events, []);
});
test('dry runs cannot mutate even if the canonical evaluator accidentally asks', async () => {
  const f = setup();
  f.deps.evaluate = async (_team, issue, _dry, _pre, _stale, options) =>
    options.client.addComment(issue.id, 'never');
  await assert.rejects(
    gateShippingLeadRequest(f.task, {
      ...f.deps,
      dryRun: true,
      beforeMutation: null,
    }),
    /dry-run-mutation/
  );
  assert.deepEqual(f.events, []);
});
test('unknown mutation outcomes throw while durable intent remains', async () => {
  const f = setup();
  f.deps.client.addComment = async () => {
    throw new Error('lost-ack');
  };
  f.deps.evaluate = async (_team, issue, _dry, _pre, _stale, options) =>
    options.client.addComment(issue.id, 'receipt');
  await assert.rejects(gateShippingLeadRequest(f.task, f.deps), /lost-ack/);
  assert.deepEqual(f.events, [['intent', 'addComment']]);
});

function useLybReviewedPlanProfile(f) {
  f.task.action = 'materialize-canonical-lyb-reviewed-plan-admission';
  f.task.authority = 'authenticated-gem-reviewed-plan-admission-only';
  f.task.safety = 'approval-labels-only-upstream-symphony-owns-pickup-dispatch';
  f.task.maximumConcurrent = 1;
  f.task.issue.identifier = 'LYB-46';
  f.task.issue.state = 'Todo';
  f.task.issue.repository = 'JovieInc/LogYourBody';
  f.task.selected.id = 'shipping-lead-lyb-reviewed-plan';
  f.task.selected.owner = 'Gem';
  f.task.selected.handle = 'LYB-46';
  f.task.source.snapshotDigest = f.task.selected.sourceDigest;
  f.deps.team = { key: 'LYB', todoStateId: 'lyb-todo-id' };
  f.deps.preflight = async () => ({
    open: true,
    load: { count: 0 },
    reason: 'open',
  });
  f.change({
    identifier: 'LYB-46',
    state: { name: 'Todo' },
  });
}

test('routes a genuine LYB event through cap one without granting dispatch', async () => {
  const f = setup();
  useLybReviewedPlanProfile(f);
  f.deps.evaluate = async (team, selected, _dry, _pre, _stale, options) => {
    assert.equal(team.key, 'LYB');
    assert.equal(selected.identifier, 'LYB-46');
    await assert.rejects(
      options.client.transitionIssue(selected.id, 'lyb-todo-id'),
      /mutation-target-mismatch/
    );
    return { status: 'approved', dispatch: 'upstream-owned' };
  };
  assert.deepEqual(await gateShippingLeadRequest(f.task, f.deps), {
    status: 'approved',
    dispatch: 'upstream-owned',
  });
  assert.deepEqual(f.events, []);

  const held = setup();
  useLybReviewedPlanProfile(held);
  held.deps.preflight = async () => ({
    open: true,
    load: { count: 1 },
    reason: 'open',
  });
  assert.equal(
    (await gateShippingLeadRequest(held.task, held.deps)).status,
    'held'
  );
  assert.deepEqual(held.events, []);
});

function lybIssue(overrides = {}) {
  const now = new Date();
  return {
    id: '00000000-0000-4000-8000-000000000046',
    identifier: 'LYB-46',
    title: 'Dogfood the bounded measurement fixture',
    description: `## Exact outcome
Commission one bounded LYB provider path and preserve its safety boundary.

## Current evidence boundary
Context and research receipts bind this exact issue revision.

## Admission / first run
Exercise a synthetic staging fixture from the checkout context and inspect its generated artifact bundle.
Do not access credentials, API keys, billing, or production data. Do not purchase anything.

## Closed-loop contract
The provider reports a useful command receipt while upstream Symphony retains pickup and dispatch.

## Required receipts / completion
Preserve native fixture, test, device, CI, install, rerun, and evidence gates. A Linux source check does not establish native iOS certification.`,
    createdAt: new Date(now.getTime() - 86_400_000).toISOString(),
    updatedAt: new Date(now.getTime() - 60_000).toISOString(),
    priority: 2,
    estimate: 1,
    state: { name: 'Todo' },
    assignee: null,
    project: null,
    labels: { nodes: [{ id: 'symphony-id', name: 'symphony' }] },
    children: { nodes: [] },
    comments: { nodes: [] },
    ...overrides,
  };
}

function reviewedPlanFixture(issueOverrides = {}) {
  const now = new Date().toISOString();
  const issue = withPreLeaseReceipts(lybIssue(issueOverrides), { now });
  const createdAt = new Date(Date.parse(now) - 1000).toISOString();
  const task = {
    schema: 'jovie-symphony-shipping-lead-task/v1',
    taskKey: 'a'.repeat(64),
    createdAt,
    expiresAt: new Date(Date.parse(now) + 120_000).toISOString(),
    owner: 'symphony',
    route: 'symphony',
    action: 'materialize-canonical-lyb-reviewed-plan-admission',
    authority: 'authenticated-gem-reviewed-plan-admission-only',
    safety: 'approval-labels-only-upstream-symphony-owns-pickup-dispatch',
    maximumConcurrent: 1,
    handoffReceiptId: 'b'.repeat(64),
    issue: {
      id: issue.id,
      identifier: issue.identifier,
      revision: issue.updatedAt,
      state: 'Todo',
      repository: 'JovieInc/LogYourBody',
    },
    selected: {
      id: 'shipping-lead-lyb-reviewed-plan',
      sourceRevision: 'c'.repeat(40),
      sourceDigest: 'd'.repeat(64),
      owner: 'Gem',
      handle: issue.identifier,
    },
    source: {
      sourceVersion: 'c'.repeat(40),
      snapshotDigest: 'd'.repeat(64),
    },
    runtime: {
      sourceRevision: 'f'.repeat(40),
      generation: '1'.repeat(64),
      invocationId: '2'.repeat(32),
    },
  };
  const reviewed = buildReviewedPlanReview(issue, { now, task });
  assert.equal(reviewed.reason, null);
  task.selected.sourceDigest = reviewed.digest;
  task.source.snapshotDigest = reviewed.digest;
  const current = structuredClone(issue);
  const calls = { comments: 0, labels: 0, transitions: 0 };
  const labelById = new Map();
  const client = {
    async addComment(_id, body) {
      calls.comments += 1;
      current.comments.nodes.push({ body });
      return { commentCreate: { success: true } };
    },
    async fetchIssue() {
      return structuredClone(current);
    },
    async fetchTeamLabel(_teamId, name) {
      const label = { id: `${name}-id`, name };
      labelById.set(label.id, label);
      return label;
    },
    async setIssueLabels(_id, labelIds) {
      calls.labels += 1;
      current.labels.nodes = labelIds.map(
        id =>
          current.labels.nodes.find(label => label.id === id) ||
          labelById.get(id)
      );
      return { issueUpdate: { success: true } };
    },
    async transitionIssue() {
      calls.transitions += 1;
      throw new Error('unexpected-transition');
    },
  };
  return {
    now,
    issue,
    task,
    client,
    calls,
    current: () => structuredClone(current),
  };
}

test('materializes approval labels only from a current accepted LYB review', async () => {
  const f = reviewedPlanFixture();
  const result = await materializeReviewedPlanAdmission({
    task: f.task,
    issue: f.issue,
    client: f.client,
    teamId: 'lyb-team',
    now: f.now,
  });
  assert.equal(result.status, 'approved');
  assert.equal(result.dispatch, 'upstream-owned');
  assert.deepEqual(f.calls, { comments: 3, labels: 2, transitions: 0 });
  const current = f.current();
  assert.equal(current.state.name, 'Todo');
  assert.deepEqual(current.labels.nodes.map(label => label.name).sort(), [
    'admission-approved',
    'plan-approved',
    'symphony',
  ]);
  assert.ok(reviewedPlanDecisionReceipt(current, { now: f.now, task: f.task }));

  const replay = await materializeReviewedPlanAdmission({
    task: f.task,
    issue: current,
    client: f.client,
    teamId: 'lyb-team',
    now: f.now,
  });
  assert.deepEqual(replay, {
    status: 'rejected',
    reason: 'reviewed-plan-task-replayed',
  });
  assert.deepEqual(f.calls, { comments: 3, labels: 2, transitions: 0 });
});

test('rejects forged identity, stale review digests, and incomplete reviews before writes', async () => {
  const cases = [
    f => {
      f.task.issue.identifier = 'LYB-47';
      f.task.selected.handle = 'LYB-47';
    },
    f => {
      f.task.source.snapshotDigest = '9'.repeat(64);
      f.task.selected.sourceDigest = '9'.repeat(64);
    },
  ];
  for (const mutate of cases) {
    const f = reviewedPlanFixture();
    mutate(f);
    const result = await materializeReviewedPlanAdmission({
      task: f.task,
      issue: f.issue,
      client: f.client,
      teamId: 'lyb-team',
      now: f.now,
    });
    assert.equal(result.status, 'rejected');
    assert.deepEqual(f.calls, { comments: 0, labels: 0, transitions: 0 });
  }

  const incompleteIssue = lybIssue({
    description: '## Proposed fix\nUse a local fixture only.',
  });
  const now = new Date().toISOString();
  const incomplete = withPreLeaseReceipts(incompleteIssue, { now });
  const base = reviewedPlanFixture();
  base.task.issue.id = incomplete.id;
  base.task.issue.identifier = incomplete.identifier;
  base.task.issue.revision = incomplete.updatedAt;
  base.task.selected.handle = incomplete.identifier;
  const result = await materializeReviewedPlanAdmission({
    task: base.task,
    issue: incomplete,
    client: base.client,
    teamId: 'lyb-team',
    now,
  });
  assert.equal(result.status, 'rejected');
  assert.deepEqual(base.calls, { comments: 0, labels: 0, transitions: 0 });
});
