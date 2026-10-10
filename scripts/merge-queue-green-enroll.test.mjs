import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
  ADMISSION_STEP,
  applyMergeGroupFailure,
} from './merge-group-failure-hold.mjs';

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
const mainSha = 'c'.repeat(40);
test('both native queue mutation clients request repository contents write', () => {
  for (const job of [
    workflow.jobs['hold-failed-revision'],
    workflow.jobs.enroll,
  ]) {
    const token = job.steps.find(step => step.id === 'app-token');
    assert.equal(token.with['permission-contents'], 'write');
    assert.equal(token.with['permission-pull-requests'], 'write');
  }
});
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
    admissionRecoveryReceipt = '',
    currentMainSha = mainSha,
    eventName = 'workflow_dispatch',
    payload = {},
    associatedPages,
    beforeStatusResponse,
    afterStatusWrite,
    readCurrentSnapshot,
    effectSink,
  } = {}
) {
  const mutations = [];
  const reads = [];
  const warnings = [];
  const notices = [];
  const statusWrites = [];
  const inventories = [];
  const gets = [];
  const effects = {
    reads,
    mutations,
    warnings,
    notices,
    statusWrites,
    inventories,
    gets,
  };
  if (effectSink) Object.assign(effectSink, effects);
  const github = {
    rest: {
      git: {
        getRef: async params => {
          assert.deepEqual(params, {
            owner: 'JovieInc',
            repo: 'Jovie',
            ref: 'heads/main',
          });
          return { data: { object: { sha: currentMainSha } } };
        },
      },
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
        createCommitStatus: async receipt => {
          statusWrites.push(receipt);
          if (afterStatusWrite) await afterStatusWrite(receipt);
          return statusWrites.length;
        },
      },
    },
    paginate: async (endpoint, params) => {
      if (endpoint === github.rest.repos.listCommitStatusesForRef) {
        if (beforeStatusResponse) await beforeStatusResponse();
        return statuses;
      }
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
      const snapshot = readCurrentSnapshot
        ? await readCurrentSnapshot(params.number, reads.length)
        : { ...current(params.number), ...overrides[params.number] };
      return { repository: { pullRequest: structuredClone(snapshot) } };
    },
  };
  await run(
    github,
    { repo: { owner: 'JovieInc', repo: 'Jovie' }, eventName, payload },
    {
      info() {},
      notice: message => notices.push(message),
      warning: message => warnings.push(message),
    },
    {
      env: {
        DRY_RUN: String(dry),
        GITHUB_WORKSPACE: process.cwd(),
        FAILURE_HOLD_RECEIPT: failureReceipt,
        ADMISSION_RECOVERY_RECEIPT: admissionRecoveryReceipt,
      },
    },
    createRequire(import.meta.url)
  );
  return effects;
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

test('a proven admission-quota ejection authorizes one unchanged-head retry without a source hold', async () => {
  const statuses = [];
  const runId = 789;
  const failedRun = {
    id: runId,
    workflow_id: 178737329,
    run_attempt: 1,
    event: 'merge_group',
    status: 'completed',
    conclusion: 'failure',
    path: '.github/workflows/ci.yml',
    head_branch: `gh-readonly-queue/main/pr-1-${mainSha}`,
    head_sha: 'd'.repeat(40),
    created_at: '2026-10-02T12:55:00Z',
    updated_at: '2026-10-02T13:00:01Z',
    html_url: `https://github.com/JovieInc/Jovie/actions/runs/${runId}`,
    repository: { full_name: 'JovieInc/Jovie' },
    head_repository: { full_name: 'JovieInc/Jovie' },
  };
  const policy = await applyMergeGroupFailure(
    {
      repository: 'JovieInc/Jovie',
      run: failedRun,
      timeline: [
        { __typename: 'PullRequestCommit', commit: { oid: sha } },
        {
          __typename: 'AddedToMergeQueueEvent',
          createdAt: '2026-10-02T12:54:00Z',
        },
        {
          __typename: 'RemovedFromMergeQueueEvent',
          createdAt: '2026-10-02T13:00:00Z',
        },
      ],
      failedSteps: [ADMISSION_STEP, 'Evaluate combined-head checks'],
      admissionText:
        'live merge queue GraphQL returned errors: API rate limit already exceeded for site ID installation.',
      statuses: [],
    },
    {
      writeStatus: async status =>
        statuses.push({
          ...status,
          creator: { type: 'Bot', login: 'jovie-bot[bot]' },
        }),
      readPullRequest: async () => current(1),
      dequeuePullRequest: async () => assert.fail('quota must not dequeue'),
      disableAutoMerge: async () =>
        assert.fail('quota must not clear merge intent'),
    }
  );
  const overrides = {
    1: {
      autoMergeRequest: { enabledAt: '2026-10-02T12:50:00Z' },
      timelineItems: { nodes: [{ createdAt: '2026-10-02T13:00:00Z' }] },
    },
  };
  const recovered = await fixture({
    statuses,
    overrides,
    eventName: 'schedule',
  });
  assert.deepEqual(recovered.mutations, [{ id: 'PR_1', oid: sha }]);
  assert.equal(
    statuses.some(status => status.context === 'jovie-queue-failure-hold/v1'),
    false
  );
  assert.deepEqual(
    recovered.statusWrites.map(status => status.description),
    ['spent:run=789;try=1']
  );
  const spent = {
    ...recovered.statusWrites[0],
    creator: { type: 'Bot', login: 'jovie-bot[bot]' },
  };
  assert.deepEqual(
    (await fixture({ statuses: [spent, ...statuses], overrides })).mutations,
    []
  );
  assert.deepEqual(
    (
      await fixture({
        statuses,
        overrides: { 1: { ...overrides[1], autoMergeRequest: null } },
      })
    ).mutations,
    []
  );
  assert.deepEqual(
    (
      await fixture({
        statuses,
        overrides: {
          1: {
            ...overrides[1],
            timelineItems: { nodes: [{ createdAt: '2026-10-02T13:01:00Z' }] },
          },
        },
      })
    ).mutations,
    []
  );
  const forged = statuses.map(status => ({
    ...status,
    creator: { type: 'User', login: 'jovie-bot[bot]' },
  }));
  assert.deepEqual(
    (await fixture({ statuses: forged, overrides })).mutations,
    []
  );
  const foreign = statuses.map(status => ({
    ...status,
    targetUrl: 'https://github.com/other/repo/actions/runs/789',
  }));
  assert.deepEqual(
    (await fixture({ statuses: foreign, overrides })).mutations,
    []
  );
  const sourceFailure = {
    context: 'jovie-queue-failure-hold/v1',
    state: 'success',
    creator: { type: 'Bot', login: 'jovie-bot[bot]' },
    description: 'class=deterministic-source;n=1;run=456;try=1',
    target_url: 'https://github.com/JovieInc/Jovie/actions/runs/456',
  };
  assert.deepEqual(
    (await fixture({ statuses: [sourceFailure, ...statuses], overrides }))
      .mutations,
    []
  );
  const rejected = await fixture({
    statuses,
    overrides,
    mutationError: Object.assign(new Error('rejected'), {
      data: { enqueuePullRequest: null },
      errors: [{ type: 'UNPROCESSABLE', path: ['enqueuePullRequest'] }],
    }),
  });
  assert.deepEqual(
    rejected.statusWrites.map(status => status.description),
    ['spent:run=789;try=1', 'released:run=789;try=1']
  );
  const uncertain = await fixture({ statuses, overrides, failMutation: true });
  assert.deepEqual(
    uncertain.statusWrites.map(status => status.description),
    ['spent:run=789;try=1']
  );
  const direct = await fixture({
    overrides,
    admissionRecoveryReceipt: JSON.stringify(policy.admissionRecoveryReceipt),
    eventName: 'workflow_run',
    payload: { workflow_run: failedRun },
    associatedPages: [],
  });
  assert.deepEqual(direct.gets, [1]);
  assert.deepEqual(direct.mutations, recovered.mutations);
  const otherPr = await fixture({
    statuses,
    roster: [candidate(2)],
    overrides: { 2: overrides[1] },
  });
  assert.deepEqual(otherPr.mutations, []);
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

test('failure-hold dequeue uses the Jovie Bot token without a merge-queue grant', () => {
  const hold = workflow.jobs['hold-failed-revision'];
  const token = hold.steps.find(step => step.id === 'app-token');
  const persist = hold.steps.find(step => step.id === 'failure-hold');
  assert.equal(
    String(token.uses).startsWith('actions/create-github-app-token@'),
    true
  );
  assert.equal(token.with['app-id'], '${{ vars.JOVIE_BOT_APP_ID }}');
  assert.equal(token.with['permission-actions'], 'read');
  assert.equal(token.with['permission-contents'], 'write');
  assert.equal(token.with['permission-pull-requests'], 'write');
  assert.equal(token.with['permission-statuses'], 'write');
  assert.equal(token.with['permission-merge-queues'], undefined);
  assert.equal(token.with['permission-administration'], undefined);
  assert.equal(persist.env.GH_TOKEN, '${{ steps.app-token.outputs.token }}');
});

test('a blocking label on a queued PR dequeues only that PR', () => {
  const job = workflow.jobs['dequeue-held'];
  assert.match(job.if, /github\.event\.action == 'labeled'/);
  for (const label of [
    'hold',
    'gated',
    'incident',
    'do-not-merge',
    'queue-poison',
  ]) {
    assert.ok(job.if.includes(`"${label}"`), label);
  }
  assert.deepEqual(job.permissions, {});
  const [token, dequeue] = job.steps;
  assert.equal(token.with['permission-pull-requests'], 'write');
  assert.equal(
    dequeue.with['github-token'],
    '${{ steps.app-token.outputs.token }}'
  );
  assert.match(dequeue.with.script, /isInMergeQueue/);
  assert.match(dequeue.with.script, /dequeuePullRequest/);
  assert.doesNotMatch(
    dequeue.with.script,
    /enqueuePullRequest|disablePullRequestAutoMerge/
  );
});

test('wakes on completed Source Validation and on the bounded reconciliation sweep', () => {
  assert.ok(workflow.on.workflow_run.workflows.includes('Source Validation'));
  assert.deepEqual(workflow.on.workflow_run.types, ['completed']);
  assert.deepEqual(workflow.on.pull_request_target.types, [
    'labeled',
    'unlabeled',
    'reopened',
  ]);
  // A label is never an enroll wake; only a blocking one dequeues its PR.
  assert.match(workflow.jobs.enroll.if, /github\.event\.action != 'labeled'/);
  // JOV-7589: a dequeue while checks are already green emits no completion
  // event, so a periodic full-roster sweep re-arms within the cadence.
  const [sweep] = workflow.on.schedule;
  const cadenceMinutes = Number(
    /^\*\/([1-9][0-9]*) \* \* \* \*$/.exec(sweep.cron)?.[1]
  );
  assert.ok(cadenceMinutes > 0 && cadenceMinutes <= 15);
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

test('a moved base permits one reserved enqueue and only explicit rejection releases it', async () => {
  const recordedMainSha = 'd'.repeat(40);
  const baseHold = {
    ...retryFailure,
    description: `class=base-branch;n=1;run=123;try=1;main=${recordedMainSha}`,
  };
  const retry = await fixture({ statuses: [baseHold] });
  assert.deepEqual(retry.mutations, [{ id: 'PR_1', oid: sha }]);
  assert.deepEqual(retry.statusWrites, [
    {
      owner: 'JovieInc',
      repo: 'Jovie',
      sha,
      state: 'success',
      context: 'jovie-queue-failure-retry/v1',
      description: 'spent:run=123;try=1',
      target_url: baseHold.target_url,
    },
  ]);
  const spent = { ...retry.statusWrites[0], creator: baseHold.creator };
  const blocked = await fixture({ statuses: [spent, baseHold] });
  assert.deepEqual(blocked.mutations, []);
  assert.deepEqual(blocked.statusWrites, []);

  const rejected = await fixture({
    statuses: [baseHold],
    mutationError: Object.assign(new Error('rejected'), {
      data: { enqueuePullRequest: null },
      errors: [{ type: 'UNPROCESSABLE', path: ['enqueuePullRequest'] }],
    }),
  });
  assert.deepEqual(rejected.mutations, [{ id: 'PR_1', oid: sha }]);
  assert.deepEqual(
    rejected.statusWrites.map(item => item.description),
    ['spent:run=123;try=1', 'released:run=123;try=1']
  );
  const released = {
    ...rejected.statusWrites[1],
    creator: baseHold.creator,
  };
  const reattempt = await fixture({ statuses: [released, spent, baseHold] });
  assert.deepEqual(reattempt.mutations, [{ id: 'PR_1', oid: sha }]);
  assert.deepEqual(reattempt.statusWrites, retry.statusWrites);

  for (const currentMainSha of [recordedMainSha, '', 'unknown']) {
    const held = await fixture({
      statuses: [released, spent, baseHold],
      currentMainSha,
    });
    assert.deepEqual(held.mutations, []);
    assert.deepEqual(held.statusWrites, []);
  }
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

test('a scheduled sweep re-enqueues a dequeued PR whose repaired head turned green', async () => {
  // JOV-7589 regression: after a merge-queue ejection the lane pushes a newer
  // head and the checks go green without a wake. The sweep must find and
  // re-enroll it; a still-removed head stays blocked without a bounded retry.
  const overrides = {
    1: { timelineItems: { nodes: [{ createdAt: '2026-10-02T11:00:00Z' }] } },
    2: {
      timelineItems: { nodes: [{ createdAt: '2026-10-02T13:00:00Z' }] },
    },
  };
  const result = await fixture({
    roster: [candidate(1), candidate(2)],
    overrides,
    eventName: 'schedule',
  });
  assert.equal(result.inventories.length, 1);
  assert.deepEqual(result.mutations, [{ id: 'PR_1', oid: sha }]);
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

// GitHub keeps only one pending run per concurrency group, even when
// cancel-in-progress is false. Evaluate the actual YAML expression so a
// repository-wide group cannot silently replace another PR's final wake.
function concurrencyGroup(github) {
  const group = workflow.concurrency.group;
  return group.replace(/\$\{\{([\s\S]*?)\}\}/g, (_whole, expression) => {
    const js = expression
      .replaceAll(
        'github.event.pull_request.number',
        'github.event.pull_request?.number'
      )
      .replaceAll(
        'github.event.workflow_run.pull_requests[0].number',
        'github.event.workflow_run?.pull_requests?.[0]?.number'
      )
      .replaceAll(
        'github.event.workflow_run.id',
        'github.event.workflow_run?.id'
      );
    return new Function('github', `return (${js});`)(github);
  });
}

const wake = (number, id) => ({
  event_name: 'workflow_run',
  event: { workflow_run: { id, pull_requests: number ? [{ number }] : [] } },
  run_id: id + 1000,
});

test('independent PR wakes survive replacement of GitHub pending runs', async () => {
  const pending = new Map();
  for (const event of [wake(7, 101), wake(8, 102)]) {
    pending.set(concurrencyGroup(event), event);
  }
  const reads = [];
  for (const event of pending.values()) {
    const result = await fixture({
      eventName: event.event_name,
      payload: event.event,
    });
    reads.push(...result.gets);
    assert.equal(result.mutations.length, 1);
  }
  assert.deepEqual(reads.sort(), [7, 8]);
});

test('same-PR wakes coalesce while unattributed receipts and manual reconciliation stay isolated', () => {
  assert.equal(concurrencyGroup(wake(7, 101)), concurrencyGroup(wake(7, 102)));
  assert.notEqual(
    concurrencyGroup(wake(null, 101)),
    concurrencyGroup(wake(null, 102))
  );
  const manual = id => ({
    event_name: 'workflow_dispatch',
    event: {},
    run_id: id,
  });
  assert.equal(concurrencyGroup(manual(1)), concurrencyGroup(manual(2)));
  assert.notEqual(concurrencyGroup(manual(1)), concurrencyGroup(wake(7, 101)));
  const label = {
    event_name: 'pull_request_target',
    event: { pull_request: { number: 7 } },
    run_id: 1,
  };
  assert.equal(concurrencyGroup(label), concurrencyGroup(wake(7, 101)));
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(workflow.jobs.enroll['timeout-minutes'], 5);
});

function recoveryDeferred() {
  /** @type {() => void} */
  let resolve = () => {};
  /** @type {Promise<void>} */
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
}

async function exerciseRecoveryBoundary(boundary, change) {
  const reached = recoveryDeferred();
  const released = recoveryDeferred();
  /** @type {ReturnType<typeof current> & { autoMergeRequest: { enabledAt: string } | null }} */
  const live = {
    ...current(1),
    autoMergeRequest: { enabledAt: '2026-10-02T12:50:00Z' },
    timelineItems: { nodes: [{ createdAt: '2026-10-02T13:00:00Z' }] },
  };
  const recovery = {
    context: 'jovie-queue-admission-recovery/v1',
    state: 'success',
    creator: { type: 'Bot', login: 'jovie-bot[bot]' },
    description: `pr=1;run=789;try=1;at=${Date.parse('2026-10-02T13:00:01Z')}`,
    target_url: 'https://github.com/JovieInc/Jovie/actions/runs/789',
  };
  /** @type {{ mutations: { id: string, oid: string }[], notices: string[],
   * warnings: string[], statusWrites: { description: string }[] }} */
  const effects = {
    mutations: [],
    notices: [],
    warnings: [],
    statusWrites: [],
  };
  const readError = new Error('current recovery read denied');
  let failFreshRead = false;
  let paused = false;
  async function pause(point) {
    if (point !== boundary || paused) return;
    paused = true;
    reached.resolve();
    await released.promise;
  }
  const pending = fixture({
    eventName: 'schedule',
    statuses: [recovery],
    effectSink: effects,
    beforeStatusResponse: () => pause('statuses'),
    afterStatusWrite: () => pause('reservation'),
    readCurrentSnapshot: () => {
      if (failFreshRead) throw readError;
      return live;
    },
  });
  // Capture rejection immediately; either workflow-level or per-PR read failure
  // is acceptable provided it cannot authorize enqueue or refund a reservation.
  const settled = pending.then(
    result => ({ result, error: undefined }),
    error => ({ result: undefined, error })
  );
  try {
    const didReach = await Promise.race([
      reached.promise.then(() => true),
      settled.then(() => false),
    ]);
    assert.equal(
      didReach,
      true,
      'fixture must reach its held recovery boundary'
    );
    assert.deepEqual(effects.mutations, []);
    if (change === 'intent-cleared') live.autoMergeRequest = null;
    if (change === 'newer-removal') {
      live.timelineItems.nodes = [{ createdAt: '2026-10-02T13:01:00Z' }];
    }
    if (change === 'replacement-head') live.headRefOid = 'b'.repeat(40);
    if (change === 'blocking-label') live.labels.nodes = [{ name: 'hold' }];
    if (change === 'read-failure') failFreshRead = true;
    released.resolve();
    const completion = await settled;
    return { ...effects, error: completion.error, readError };
  } finally {
    released.resolve();
    await Promise.allSettled([pending]);
  }
}

function assertNoRecoveryEnqueue(result, boundary) {
  assert.deepEqual(result.mutations, []);
  assert.deepEqual(
    result.notices.filter(message => message.startsWith('ENQUEUED ')),
    []
  );
  assert.deepEqual(
    result.statusWrites.map(status => status.description),
    boundary === 'reservation' ? ['spent:run=789;try=1'] : []
  );
}

for (const boundary of ['statuses', 'reservation']) {
  test(`unchanged recovery survives the awaited ${boundary} boundary`, async () => {
    const result = await exerciseRecoveryBoundary(boundary, 'unchanged');
    assert.equal(result.error, undefined);
    assert.deepEqual(result.mutations, [{ id: 'PR_1', oid: sha }]);
    assert.deepEqual(
      result.statusWrites.map(status => status.description),
      ['spent:run=789;try=1']
    );
    assert.deepEqual(result.warnings, []);
    assert.equal(
      result.notices.filter(message => message.startsWith('ENQUEUED ')).length,
      1
    );
  });

  for (const change of [
    'intent-cleared',
    'newer-removal',
    'replacement-head',
    'blocking-label',
  ]) {
    test(`recovery fences ${change} during awaited ${boundary}`, async () => {
      const result = await exerciseRecoveryBoundary(boundary, change);
      assert.equal(result.error, undefined);
      assertNoRecoveryEnqueue(result, boundary);
      assert.deepEqual(result.warnings, []);
    });
  }

  test(`a fresh read failure after ${boundary} cannot enqueue or refund`, async () => {
    const result = await exerciseRecoveryBoundary(boundary, 'read-failure');
    assertNoRecoveryEnqueue(result, boundary);
    assert.ok(
      result.error === result.readError ||
        result.warnings.some(message =>
          message.includes(result.readError.message)
        ),
      'the fresh read failure must remain visible'
    );
  });
}

const dequeueScript = workflow.jobs['dequeue-held'].steps.find(
  step => step.with?.script
).with.script;
const runDequeue = new AsyncFunction(
  'github',
  'context',
  'core',
  dequeueScript
);
const labelEvent = (label = 'hold') => ({
  pull_request: { number: 7, head: { sha } },
  label: { name: label },
});
/** @param {Record<string, unknown>} overrides */
const heldPR = (overrides = {}) => ({
  id: 'PR_7',
  state: 'OPEN',
  headRefOid: sha,
  isInMergeQueue: true,
  labels: { pageInfo: { hasNextPage: false }, nodes: [{ name: 'hold' }] },
  ...overrides,
});

/**
 * @param {{ payload?: object, currentPR?: unknown, readError?: Error,
 * mutationError?: Error, beforeReadResponse?: () => Promise<void> }} options
 */
async function dequeueFixture({
  payload = labelEvent(),
  currentPR = heldPR(),
  readError,
  mutationError,
  beforeReadResponse,
} = {}) {
  /** @type {Record<string, unknown>[]} */
  const reads = [];
  /** @type {Record<string, unknown>[]} */
  const mutations = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const notices = [];
  await runDequeue(
    {
      graphql: async (
        /** @type {string} */ query,
        /** @type {Record<string, unknown>} */ variables
      ) => {
        if (query.includes('mutation(')) {
          assert.match(query, /dequeuePullRequest/);
          assert.doesNotMatch(
            query,
            /enqueuePullRequest|disablePullRequestAutoMerge/
          );
          mutations.push(variables);
          if (mutationError) throw mutationError;
          return { dequeuePullRequest: { clientMutationId: null } };
        }
        reads.push(variables);
        assert.deepEqual(variables, {
          owner: 'JovieInc',
          repo: 'Jovie',
          number: 7,
        });
        if (readError) throw readError;
        await beforeReadResponse?.();
        return { repository: { pullRequest: currentPR } };
      },
    },
    { repo: { owner: 'JovieInc', repo: 'Jovie' }, payload },
    {
      info() {},
      notice: (/** @type {string} */ message) => notices.push(message),
      warning: (/** @type {string} */ message) => warnings.push(message),
    }
  );
  return { reads, mutations, warnings, notices };
}

for (const label of [
  'hold',
  'gated',
  'incident',
  'do-not-merge',
  'queue-poison',
]) {
  test(`dequeues the unchanged queued head while ${label} is still present`, async () => {
    const result = await dequeueFixture({
      payload: labelEvent(label),
      currentPR: heldPR({
        labels: { pageInfo: { hasNextPage: false }, nodes: [{ name: label }] },
      }),
    });
    assert.equal(result.reads.length, 1);
    assert.deepEqual(result.mutations, [{ id: 'PR_7' }]);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.notices, [
      `DEQUEUED #7: labeled ${label} while queued`,
    ]);
  });
}

test('an old labeled event cannot dequeue the same head after its label is removed', async () => {
  const result = await dequeueFixture({
    currentPR: heldPR({
      labels: { pageInfo: { hasNextPage: false }, nodes: [] },
    }),
  });
  assert.equal(result.reads.length, 1);
  assert.deepEqual(result.mutations, []);
});

test('an old labeled event cannot dequeue a replacement head even if it is still held', async () => {
  const result = await dequeueFixture({
    currentPR: heldPR({ headRefOid: 'b'.repeat(40) }),
  });
  assert.equal(result.reads.length, 1);
  assert.deepEqual(result.mutations, []);
});

test('a different remaining blocking label does not revive the removed event label', async () => {
  const result = await dequeueFixture({
    currentPR: heldPR({
      labels: {
        pageInfo: { hasNextPage: false },
        nodes: [{ name: 'incident' }],
      },
    }),
  });
  assert.deepEqual(result.mutations, []);
});

test('incomplete historical label events make no API calls', async () => {
  for (const payload of [
    {},
    { ...labelEvent(), pull_request: { number: 0, head: { sha } } },
    { ...labelEvent(), pull_request: { number: 7, head: { sha: 'unknown' } } },
    { ...labelEvent(), pull_request: { number: 7, head: { sha: [sha] } } },
    labelEvent('enhancement'),
  ]) {
    const result = await dequeueFixture({ payload });
    assert.deepEqual(result.reads, []);
    assert.deepEqual(result.mutations, []);
  }
});

test('incomplete, unqueued or closed current PR evidence cannot authorize a dequeue', async () => {
  for (const currentPR of [
    null,
    heldPR({ id: null }),
    heldPR({ state: 'CLOSED' }),
    heldPR({ isInMergeQueue: false }),
    heldPR({ isInMergeQueue: 'true' }),
    heldPR({ labels: null }),
    heldPR({ labels: { nodes: [{ name: 'hold' }] } }),
    heldPR({
      labels: { pageInfo: { hasNextPage: true }, nodes: [{ name: 'hold' }] },
    }),
    heldPR({ labels: { pageInfo: { hasNextPage: false }, nodes: null } }),
    heldPR({ labels: { pageInfo: { hasNextPage: false }, nodes: [null] } }),
    heldPR({
      labels: { pageInfo: { hasNextPage: false }, nodes: [{ name: 1 }] },
    }),
  ]) {
    const result = await dequeueFixture({ currentPR });
    assert.equal(result.reads.length, 1);
    assert.deepEqual(result.mutations, []);
  }
});

test('current-state read failure rejects and dequeue denial preserves warning behavior', async () => {
  const readError = new Error('read denied');
  await assert.rejects(
    dequeueFixture({ readError }),
    error => error === readError
  );
  const result = await dequeueFixture({
    mutationError: new Error('dequeue denied'),
  });
  assert.equal(result.reads.length, 1);
  assert.deepEqual(result.mutations, [{ id: 'PR_7' }]);
  assert.deepEqual(result.warnings, [
    'dequeue of held #7 failed: dequeue denied',
  ]);
  assert.deepEqual(result.notices, []);
});

test('blocking label matching preserves GitHub case-insensitive event semantics', async () => {
  const result = await dequeueFixture({
    payload: labelEvent('HOLD'),
    currentPR: heldPR({
      labels: { pageInfo: { hasNextPage: false }, nodes: [{ name: 'Hold' }] },
    }),
  });
  assert.deepEqual(result.mutations, [{ id: 'PR_7' }]);
  assert.deepEqual(result.notices, ['DEQUEUED #7: labeled HOLD while queued']);
});

test('a deferred current-state read cannot dequeue a repaired head after its hold is removed', async () => {
  /** @type {() => void} */
  let signalRead = () => {};
  /** @type {() => void} */
  let releaseRead = () => {};
  /** @type {Promise<void>} */
  const readStarted = new Promise(resolve => {
    signalRead = resolve;
  });
  /** @type {Promise<void>} */
  const readGate = new Promise(resolve => {
    releaseRead = resolve;
  });
  const currentPR = heldPR();
  const pending = dequeueFixture({
    currentPR,
    beforeReadResponse: async () => {
      signalRead();
      await readGate;
    },
  });
  try {
    // A settled invocation must not make a regressed/missing read hang the test.
    await Promise.race([readStarted, pending]);
    currentPR.headRefOid = 'b'.repeat(40);
    currentPR.labels.nodes = [];
    releaseRead();
    const result = await pending;
    assert.equal(result.reads.length, 1);
    assert.deepEqual(result.mutations, []);
    assert.deepEqual(result.notices, []);
  } finally {
    releaseRead();
    await Promise.allSettled([pending]);
  }
});
