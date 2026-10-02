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
const run = new AsyncFunction('github', 'context', 'core', 'process', script);
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

async function fixture({
  roster = [candidate(1)],
  overrides = {},
  dry = false,
  failRead = false,
  failMutation = false,
} = {}) {
  const mutations = [];
  const reads = [];
  const warnings = [];
  const github = {
    rest: { pulls: { list: Symbol('pulls.list') } },
    paginate: async (endpoint, params) => {
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
    { repo: { owner: 'JovieInc', repo: 'Jovie' } },
    {
      info() {},
      notice() {},
      warning: message => warnings.push(message),
    },
    { env: { DRY_RUN: String(dry) } }
  );
  return { reads, mutations, warnings };
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
  assert.ok(workflow.on.pull_request_target.types.includes('ready_for_review'));
  assert.equal(workflow.on.schedule, undefined);
  assert.match(workflow.jobs.enroll.if, /conclusion == 'success'/);
  const ready = load(
    readFileSync('.github/workflows/auto-ready-agent-drafts.yml', 'utf8')
  );
  assert.ok(ready.on.workflow_run.workflows.includes('Source Validation'));
  assert.match(ready.jobs['green-source'].if, /source-validation\.yml/);
});
