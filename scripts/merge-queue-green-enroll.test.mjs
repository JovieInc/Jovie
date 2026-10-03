import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
const workflow = load(
  readFileSync('.github/workflows/merge-queue-green-enroll.yml', 'utf8')
);
const script = workflow.jobs.enroll.steps.find(step => step.with?.script).with
  .script;
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = new AsyncFunction(
  'github',
  'context',
  'core',
  'process',
  'require',
  script
);
const sha = 'a'.repeat(40);
const candidate = number => ({
  number,
  draft: false,
  head: { sha, repo: { full_name: 'JovieInc/Jovie' } },
  labels: [],
});
const current = number => ({
  id: `PR_${number}`,
  number,
  state: 'OPEN',
  baseRefName: 'main',
  headRefOid: sha,
  isDraft: false,
  isInMergeQueue: false,
  isCrossRepository: false,
  mergeStateStatus: 'CLEAN',
  labels: { pageInfo: { hasNextPage: false }, nodes: [] },
  commits: { nodes: [{ commit: { committedDate: '2026-10-02T12:00:00Z' } }] },
  timelineItems: { nodes: [] },
});

async function fixture(
  /** @type {any} */ {
    roster = [candidate(1)],
    overrides = {},
    dry = false,
    failRead = false,
    failMutation = false,
    statuses = [],
    mutationError = undefined,
    failureReceipt = '',
    eventName = 'workflow_dispatch',
    payload = {},
    associatedPages,
  } = {}
) {
  const mutations = [];
  const reads = [];
  const warnings = [];
  const statusWrites = [];
  const inventories = [];
  const gets = [];
  const github = {
    rest: {
      pulls: {
        list: Symbol('pulls.list'),
        get: async params => {
          gets.push(params.pull_number);
          return {
            data: {
              ...candidate(params.pull_number),
              state: 'open',
              base: { ref: 'main' },
            },
          };
        },
      },
      repos: {
        listPullRequestsAssociatedWithCommit: Symbol('associated'),
        listCommitStatusesForRef: Symbol('statuses.list'),
        createCommitStatus: async receipt => statusWrites.push(receipt),
      },
    },
    paginate: async (endpoint, params) => {
      if (endpoint === github.rest.repos.listCommitStatusesForRef)
        return statuses;
      inventories.push(endpoint);
      if (endpoint === github.rest.repos.listPullRequestsAssociatedWithCommit) {
        assert.deepEqual(params, {
          owner: 'JovieInc',
          repo: 'Jovie',
          commit_sha: sha,
          per_page: 100,
        });
        return associatedPages === undefined ? roster : associatedPages;
      }
      assert.equal(endpoint, github.rest.pulls.list);
      assert.deepEqual(params, {
        owner: 'JovieInc',
        repo: 'Jovie',
        state: 'open',
        base: 'main',
        per_page: 100,
      });
      return roster;
    },
    graphql: async (query, params) => {
      if (query.includes('enqueuePullRequest')) {
        mutations.push(params);
        if (mutationError) throw mutationError;
        if (failMutation) throw new Error('head changed');
        return { enqueuePullRequest: { mergeQueueEntry: { position: 1 } } };
      }
      assert.ok(query.includes('pullRequest(number: $number)'));
      assert.ok(!query.includes('pullRequests('));
      assert.ok(query.includes('labels(first: 100)'));
      reads.push(params.number);
      if (failRead) throw new Error('Resource limits for this query exceeded');
      return {
        repository: {
          pullRequest: {
            ...current(params.number),
            ...overrides[params.number],
          },
        },
      };
    },
  };
  await run(
    github,
    { repo: { owner: 'JovieInc', repo: 'Jovie' }, eventName, payload },
    {
      info() {},
      notice() {},
      warning: message => warnings.push(message),
    },
    {
      env: {
        DRY_RUN: String(dry),
        GITHUB_WORKSPACE: process.cwd(),
        FAILURE_HOLD_RECEIPT: failureReceipt,
      },
    },
    createRequire(import.meta.url)
  );
  return { reads, mutations, warnings, statusWrites, inventories, gets };
}

test('scans 113 PRs without a multiplied GraphQL query and pins each enqueue head', async () => {
  const roster = Array.from({ length: 113 }, (_, i) => ({
    ...candidate(i + 1),
    draft: i < 110,
  }));
  const result = await fixture({ roster });
  assert.deepEqual(result.reads, [111, 112, 113]);
  assert.deepEqual(
    result.mutations,
    [111, 112, 113].map(n => ({ id: `PR_${n}`, oid: sha }))
  );
});

test('preserves live holds, rejected heads, conflicts, drafts, queue membership and source leases', async () => {
  const roster = Array.from({ length: 11 }, (_, i) => candidate(i + 1));
  roster[0].labels = [{ name: 'hold' }];
  roster[1].head.repo.full_name = 'external/Jovie';
  const overrides = {
    3: {
      labels: {
        pageInfo: { hasNextPage: false },
        nodes: [{ name: 'QUEUE-POISON' }],
      },
    },
    4: { labels: { pageInfo: { hasNextPage: true }, nodes: [] } },
    5: { isInMergeQueue: true },
    6: { isDraft: true },
    7: { mergeStateStatus: 'DIRTY' },
    8: { headRefOid: 'b'.repeat(40) },
    9: { baseRefName: 'feature' },
    10: { state: 'CLOSED' },
    11: { timelineItems: { nodes: [{ createdAt: '2026-10-02T13:00:00Z' }] } },
  };
  assert.deepEqual((await fixture({ roster, overrides })).mutations, []);
});

test('permits a repaired head committed after rejection, and dry runs never mutate', async () => {
  const overrides = {
    1: { timelineItems: { nodes: [{ createdAt: '2026-10-02T11:00:00Z' }] } },
  };
  assert.equal((await fixture({ overrides })).mutations.length, 1);
  assert.deepEqual((await fixture({ overrides, dry: true })).mutations, []);
});

test('read failures abort without enqueue and a raced mutation does not stop the next PR', async () => {
  await assert.rejects(fixture({ failRead: true }), /Resource limits/);
  const result = await fixture({
    roster: [candidate(1), candidate(2)],
    failMutation: true,
  });
  assert.equal(result.mutations.length, 2);
  assert.equal(result.warnings.length, 2);
});

test('wakes both existing controllers on completed Source Validation without a polling schedule', () => {
  assert.ok(workflow.on.workflow_run.workflows.includes('Source Validation'));
  assert.deepEqual(workflow.on.workflow_run.types, ['completed']);
  assert.deepEqual(workflow.on.pull_request_target.types, [
    'unlabeled',
    'reopened',
  ]);
  assert.equal(workflow.on.schedule, undefined);
  assert.match(workflow.jobs.enroll.if, /conclusion == 'success'/);
  const ready = load(
    readFileSync('.github/workflows/auto-ready-agent-drafts.yml', 'utf8')
  );
  assert.ok(ready.on.workflow_run.workflows.includes('Source Validation'));
  assert.match(ready.jobs['green-source'].if, /source-validation\.yml/);
});

const retryFailure = {
  context: 'jovie-queue-failure-hold/v1',
  state: 'success',
  creator: { login: 'jovie-bot[bot]', type: 'Bot' },
  description: 'class=transient-infrastructure;n=1;run=123;try=1',
  target_url: 'https://github.com/JovieInc/Jovie/actions/runs/123',
};
test('trusted job receipt prevents enrollment while status replication is empty', async () => {
  const receipt = {
    schema: 'jovie-merge-group-failure-hold/v1',
    repository: 'JovieInc/Jovie',
    prNumber: 1,
    sourceHeadSha: sha,
    classification: 'deterministic-source',
    failureNumber: 1,
    workflowRunId: 123,
    workflowRunAttempt: 1,
  };
  const held = await fixture({ failureReceipt: JSON.stringify(receipt) });
  assert.deepEqual(held.mutations, []);
  const retry = await fixture({
    failureReceipt: JSON.stringify({
      ...receipt,
      classification: 'transient-infrastructure',
    }),
    eventName: 'workflow_run',
    payload: {
      workflow_run: {
        event: 'merge_group',
        head_sha: 'b'.repeat(40),
        head_branch: `gh-readonly-queue/main/pr-1-${sha}`,
        pull_requests: [],
      },
    },
  });
  assert.deepEqual(retry.gets, [1]);
  assert.equal(retry.mutations.length, 1);
  assert.deepEqual(
    retry.statusWrites.map(item => item.description),
    ['spent:run=123;try=1']
  );
  assert.deepEqual(retry.inventories, []);
  const changed = await fixture({
    failureReceipt: JSON.stringify({
      ...receipt,
      sourceHeadSha: 'b'.repeat(40),
    }),
  });
  assert.equal(changed.mutations.length, 1);
  await assert.rejects(fixture({ failureReceipt: 'malformed' }));
  assert.equal(
    workflow.jobs['hold-failed-revision'].outputs.failure_receipt,
    '${{ steps.failure-hold.outputs.failure_receipt }}'
  );
  assert.match(
    workflow.jobs.enroll.steps.find(step => step.with?.script).env
      .FAILURE_HOLD_RECEIPT,
    /needs.hold-failed-revision.outputs.failure_receipt/
  );
});
test('definitive rejected mutation releases retry while ambiguous errors preserve its reservation', async () => {
  const error = Object.assign(new Error('rejected'), {
    data: { enqueuePullRequest: null },
    errors: [{ type: 'UNPROCESSABLE', path: ['enqueuePullRequest'] }],
  });
  const rejected = await fixture({
    statuses: [retryFailure],
    mutationError: error,
  });
  assert.deepEqual(
    rejected.statusWrites.map(item => item.description),
    ['spent:run=123;try=1', 'released:run=123;try=1']
  );
  const uncertain = await fixture({
    statuses: [retryFailure],
    failMutation: true,
  });
  assert.deepEqual(
    uncertain.statusWrites.map(item => item.description),
    ['spent:run=123;try=1']
  );
  const success = await fixture({ statuses: [retryFailure] });
  assert.deepEqual(
    success.statusWrites.map(item => item.description),
    ['spent:run=123;try=1']
  );
});

test('a PR wake reads only its current candidate instead of rescanning the whole queue', async () => {
  const roster = Array.from({ length: 113 }, (_, i) => candidate(i + 1));
  for (const { eventName, payload } of [
    {
      eventName: 'pull_request_target',
      payload: { pull_request: { number: 7 } },
    },
    {
      eventName: 'workflow_run',
      payload: { workflow_run: { pull_requests: [{ number: 7 }] } },
    },
  ]) {
    const result = await fixture({ roster, eventName, payload });
    assert.deepEqual(result.inventories, []);
    assert.deepEqual(result.gets, [7]);
    assert.deepEqual(result.reads, [7]);
    assert.equal(result.mutations.length, 1);
  }
});

test('an unattributable automatic wake cannot authorize a global queue scan', async () => {
  for (const { eventName, payload } of [
    {
      eventName: 'workflow_run',
      payload: { workflow_run: { head_sha: 'bad', pull_requests: [] } },
    },
    { eventName: 'pull_request_target', payload: {} },
    { eventName: 'unknown', payload: {} },
  ]) {
    const result = await fixture({ eventName, payload });
    assert.deepEqual(result.inventories, []);
    assert.deepEqual(result.reads, []);
    assert.deepEqual(result.mutations, []);
  }
});

test('PR-target workflow receipts resolve only an exact same-repo source association', async () => {
  const valid = {
    ...candidate(7),
    state: 'open',
    base: { ref: 'main' },
    head: { ...candidate(7).head, ref: 'codex/source' },
  };
  const roster = [
    null,
    { state: 'open' },
    valid,
    { ...valid, number: 8, head: { ...valid.head, sha: 'b'.repeat(40) } },
    { ...valid, number: 9, head: { ...valid.head, ref: 'other' } },
    {
      ...valid,
      number: 10,
      head: { ...valid.head, repo: { full_name: 'fork/Jovie' } },
    },
    { ...valid, number: 11, state: 'closed' },
    { ...valid, number: 12, base: { ref: 'feature' } },
  ];
  const result = await fixture({
    roster,
    eventName: 'workflow_run',
    payload: {
      workflow_run: {
        head_sha: sha,
        head_branch: 'codex/source',
        pull_requests: [],
      },
    },
  });
  assert.equal(result.inventories.length, 1);
  assert.deepEqual(result.gets, [7]);
  assert.deepEqual(result.reads, [7]);
  assert.equal(result.mutations.length, 1);
});

test('commit association uses the repos route and tolerates an empty page', async () => {
  assert.match(
    script,
    /github\.paginate\(github\.rest\.repos\.listPullRequestsAssociatedWithCommit/
  );
  assert.doesNotMatch(
    script,
    /github\.rest\.commits\.listPullRequestsAssociatedWithCommit/
  );
  const payload = {
    workflow_run: {
      head_sha: sha,
      head_branch: 'codex/source',
      pull_requests: [],
    },
  };
  for (const associatedPages of [[], null, { data: [] }]) {
    const result = await fixture({
      associatedPages,
      eventName: 'workflow_run',
      payload,
    });
    assert.equal(result.inventories.length, 1);
    assert.deepEqual(result.gets, []);
    assert.deepEqual(result.reads, []);
    assert.deepEqual(result.mutations, []);
  }
});

test('paginated commit associations enqueue each exact open main PR once', async () => {
  const head = {
    sha,
    ref: 'codex/source',
    repo: { full_name: 'JovieInc/Jovie' },
  };
  const row = number => ({
    ...candidate(number),
    state: 'open',
    base: { ref: 'main' },
    head,
  });
  const result = await fixture({
    associatedPages: [row(7), row(7), row(8)],
    eventName: 'workflow_run',
    payload: {
      workflow_run: {
        head_sha: sha,
        head_branch: 'codex/source',
        pull_requests: [],
      },
    },
  });
  assert.equal(result.inventories.length, 1);
  assert.deepEqual(result.gets, [7, 8]);
  assert.deepEqual(result.reads, [7, 8]);
  assert.equal(result.mutations.length, 2);
});

test('duplicated automatic PR associations do not multiply live reads or enqueue mutations', async () => {
  const result = await fixture({
    eventName: 'workflow_run',
    payload: {
      workflow_run: {
        pull_requests: [{ number: 7 }, { number: 7 }, { number: -1 }],
      },
    },
  });
  assert.deepEqual(result.gets, [7]);
  assert.deepEqual(result.reads, [7]);
  assert.equal(result.mutations.length, 1);
});
