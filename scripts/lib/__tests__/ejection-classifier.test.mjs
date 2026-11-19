import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyRun,
  planLinearUpserts,
  runClassifier,
  upsertLinear,
} from '../ejection-classifier.mjs';

const now = 1800000000000;
const repo = 'JovieInc/Jovie';
const head = 'a'.repeat(40);
const run = {
  id: 1,
  event: 'merge_group',
  head_branch: `gh-readonly-queue/main/pr-123-${head}`,
  head_repository: { full_name: repo },
  run_attempt: 1,
};
const classify = (jobs, recent = []) =>
  classifyRun({ repo, run, jobs, recent, now });
for (const [cls, name, message, conclusion] of [
  ['code', 'Unit Tests', 'assertion failed', 'failure'],
  ['infra', 'Size Guard', '403 rate limit quota exceeded', 'failure'],
  ['infra', 'Build', '', 'timed_out'],
  ['infra', 'Required check', '', 'cancelled'],
  ['contract', 'Merge Suite Scope', 'cannot claim unit results', 'failure'],
  ['size', 'PR Size Guard', 'exceeds 800 lines', 'failure'],
  [
    'conflict',
    'test merge',
    'Automatic merge failed: merge conflict',
    'failure',
  ],
])
  test(`classifies ${name}/${conclusion} as ${cls}`, () => {
    const result = classify([
      {
        name,
        conclusion,
        required: name === 'Required check',
        annotations: [{ message }],
      },
    ]);
    assert.equal(result.class, cls);
    assert.equal(result.head, head);
    assert.equal(result.pr, 123);
    assert.equal(result.schema, 'ejection/v1');
  });
test('systemic correlation requires the same job across three distinct PRs in two hours', () => {
  const recent = [2, 3].map(pr => ({
    id: pr,
    head_branch: `gh-readonly-queue/main/pr-${pr}-${head}`,
    updated_at: new Date(now - 1000).toISOString(),
    jobs: [{ name: 'Build', conclusion: 'failure' }],
  }));
  assert.equal(
    classify([{ name: 'Build', conclusion: 'failure' }], recent).class,
    'systemic'
  );
  assert.equal(
    classify([{ name: 'Other', conclusion: 'failure' }], recent).class,
    'code'
  );
  assert.equal(
    classify(
      [{ name: 'Build', conclusion: 'failure' }],
      recent.map(r => ({
        ...r,
        updated_at: new Date(now - 3 * 3600000).toISOString(),
      }))
    ).class,
    'code'
  );
});
test('aggregate failures do not hide infra leaves and mixed code remains code', () => {
  assert.equal(
    classify([
      { name: 'PR Ready', conclusion: 'failure' },
      { name: 'Build', conclusion: 'timed_out' },
    ]).class,
    'infra'
  );
  assert.equal(
    classify([
      { name: 'Build', conclusion: 'timed_out' },
      { name: 'Unit', conclusion: 'failure' },
    ]).class,
    'code'
  );
});
test('malformed branch identity cannot produce a receipt or label', () => {
  assert.throws(
    () =>
      classifyRun({
        repo,
        run: { ...run, head_branch: 'pr-123-short' },
        jobs: [],
        now,
      }),
    /identity/
  );
});
test('Linear upserts require two unique occurrences in seven days and rate limit each class/job to one hour', () => {
  const receipt = classify([{ name: 'Build', conclusion: 'timed_out' }]);
  const history = [
    { ...receipt, run: 2, at: new Date(now - 2000).toISOString() },
  ];
  const plan = planLinearUpserts({ receipt, history, now });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].count, 2);
  assert.equal(
    planLinearUpserts({ receipt, history: [receipt], now }).length,
    0
  );
  assert.equal(
    planLinearUpserts({
      receipt,
      history: [
        { ...history[0], at: new Date(now - 8 * 86400000).toISOString() },
      ],
      now,
    }).length,
    0
  );
  const issue = {
    id: 'one',
    description: `ejection-key:${plan[0].key} ejection-upsert-at:${now - 3599999}`,
  };
  assert.equal(
    planLinearUpserts({ receipt, history, issues: [issue], now }).length,
    0
  );
  issue.description = `ejection-key:${plan[0].key} ejection-upsert-at:${now - 3600000}`;
  assert.equal(
    planLinearUpserts({ receipt, history, issues: [issue], now }).length,
    1
  );
  assert.equal(
    planLinearUpserts({
      receipt: classify([{ name: 'Unit', conclusion: 'failure' }]),
      history,
      now,
    }).length,
    0
  );
});
test('absent existing Linear secret skips without any network', async () => {
  assert.deepEqual(
    await upsertLinear({ key: '', request: () => assert.fail('network') }),
    { skipped: 'LINEAR_API_KEY absent' }
  );
});
test('classifier writes receipt then only its label; it never re-enqueues', async () => {
  const mutations = [],
    writes = [];
  const receipt = await runClassifier({
    repo,
    runId: 1,
    now,
    writeReceipt: r => writes.push(r),
    io: {
      get: async () => run,
      pages: async () => [],
      jobs: async () => [],
      annotatedJobs: async () => [{ name: 'Build', conclusion: 'timed_out' }],
      api: async (path, options) => mutations.push({ path, options }),
    },
  });
  assert.equal(writes.length, 1);
  assert.equal(receipt.class, 'infra');
  assert.deepEqual(mutations, [
    {
      path: `repos/${repo}/issues/123/labels`,
      options: { method: 'POST', body: { labels: ['mq-ejected:infra'] } },
    },
  ]);
});

test('unattributed cancellation is not a free infrastructure retry', () => {
  assert.equal(
    classify([{ name: 'Unknown check', conclusion: 'cancelled' }]).class,
    'code'
  );
});

test('Linear transport creates one class/job issue, then skips another upsert within the hour', async () => {
  const { MemoryLedgerStore } = await import(
    '../../../packages/api-client/store.ts'
  );
  const receipt = classify([{ name: 'Build', conclusion: 'timed_out' }]);
  const history = [{ ...receipt, run: 2 }];
  const issues = [],
    mutations = [];
  const request = async (_url, options) => {
    const { query, variables } = JSON.parse(options.body);
    let data;
    if (query.includes('issueCreate')) {
      mutations.push(variables.input);
      issues.push({
        id: 'existing',
        description: variables.input.description,
        updatedAt: new Date(now).toISOString(),
      });
      data = { issueCreate: { success: true } };
    } else {
      assert.ok(
        !query.includes('issueUpdate'),
        'hourly rate limit must avoid the update mutation'
      );
      data = {
        teams: { nodes: [{ id: 'team', key: 'JOV' }] },
        issues: { nodes: issues, pageInfo: { hasNextPage: false } },
      };
    }
    return new Response(JSON.stringify({ data }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  const clientOptions = {
    store: new MemoryLedgerStore(),
    legacyStateRoot: null,
    log: () => {},
  };
  assert.deepEqual(
    await upsertLinear({
      receipt,
      history,
      now,
      key: 'lin_api_offline',
      request,
      clientOptions,
    }),
    { upserts: 1 }
  );
  assert.deepEqual(
    await upsertLinear({
      receipt: { ...receipt, run: 3 },
      history,
      now: now + 1000,
      key: 'lin_api_offline',
      request,
      clientOptions,
    }),
    { upserts: 0 }
  );
  assert.equal(mutations.length, 1);
  assert.match(mutations[0].description, /Count: 2 distinct ejections/);
});
