import assert from 'node:assert/strict';
import test from 'node:test';
import { gateShippingLeadRequest } from '../shipping-lead-gate.mjs';

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
