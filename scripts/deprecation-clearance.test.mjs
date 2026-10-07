import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  DEPRECATION_COVERAGE_COMMAND,
  SCRIPT_CONTRACT_NODE_COMMAND,
} from './ci-fast-lanes.mjs';
import {
  MAX_OBSERVATIONS,
  recordDeprecationObservations,
  runDeprecationClearance,
} from './deprecation-clearance.mjs';
import { extractDeprecations } from './deprecation-intake.mjs';
import {
  deprecationCheckGreen,
  formatDeprecationObservation,
  parseDeprecationObservation,
} from './lib/deprecation-observation.mjs';

const SHA = 'a'.repeat(40),
  MERGE = 'b'.repeat(40),
  RUN = 'https://github.com/JovieInc/Jovie/actions/runs/123';
const WARNING =
  '⚠ The "preferredRegion" route segment config is deprecated. Learn more: https://nextjs.org/docs/messages/preferred-region-deprecated';
const FP = extractDeprecations(WARNING)[0].fingerprint;
const LOG = 'Compiled successfully';
function observation(status = 'green', time = '2026-10-07T12:00:00Z') {
  return {
    schema: 'jovie.deprecation-observation/v1',
    issue: 'JOV-7877',
    fingerprint: FP,
    status,
    headSha: SHA,
    runUrl: RUN,
    observedAt: time,
  };
}
function fixture() {
  const issue = {
    id: 'issue',
    identifier: 'JOV-7877',
    title: `[${FP}] Resolve deprecation`,
    updatedAt: '2026-10-07T11:00:00Z',
    comments: { nodes: [], pageInfo: { hasNextPage: false } },
    attachments: {
      nodes: [{ url: 'https://github.com/JovieInc/Jovie/pull/20639' }],
      pageInfo: { hasNextPage: false },
    },
  };
  const state = {
    issue,
    run: {
      event: 'merge_group',
      path: '.github/workflows/ci.yml',
      conclusion: 'success',
      head_sha: SHA,
      updated_at: '2026-10-07T12:00:00Z',
    },
    jobs: [{ id: 1, name: 'Build + Layout (combined)', conclusion: 'success' }],
    pull: {
      state: 'closed',
      merged: true,
      merge_commit_sha: MERGE,
      title: 'fix(web): remove deprecated preferred region config (JOV-7877)',
    },
    production: { status: 'verified', sha: SHA },
    contains: true,
    writes: [],
    changed: false,
    badReadback: false,
    inventoryMore: false,
    jobsMore: false,
    badJobs: false,
  };
  const options = {
    log: LOG,
    source: {
      schema: 'jovie.build-log-observation/v1',
      complete: true,
      headSha: SHA,
      runUrl: RUN,
      jobIds: [1],
      logSha256: createHash('sha256').update(LOG).digest('hex'),
    },
    github: async path => ({
      body: path.includes('/jobs?')
        ? state.badJobs
          ? {}
          : { jobs: state.jobs }
        : path.includes('/pulls/')
          ? state.pull
          : state.run,
      link: state.jobsMore ? 'rel="next"' : '',
    }),
    facts: {
      servedGeneration: async () => state.production,
      contains: async () => state.contains,
    },
    linear: async query =>
      query.includes('DeprecationComment')
        ? {
            comment: {
              body: state.badReadback ? 'wrong' : state.writes.at(-1)?.body,
            },
          }
        : query.includes('DeprecationCurrent')
          ? {
              issue: state.changed
                ? { ...state.issue, updatedAt: '2026-10-07T12:01:00Z' }
                : state.issue,
            }
          : {
              issues: {
                nodes: [state.issue],
                pageInfo: { hasNextPage: state.inventoryMore },
              },
            },
    comment: async value => {
      state.writes.push(value);
      return { ok: true, id: 'comment' };
    },
  };
  return { state, options };
}
test('records disappearance only for current verified production containing its repair, without state mutation', async () => {
  const { state, options } = fixture();
  const result = await recordDeprecationObservations(options);
  assert.equal(result.results[0].status, 'green');
  assert.equal(state.writes.length, 1);
  assert.equal(parseDeprecationObservation(state.writes[0].body).headSha, SHA);
  assert.match(state.writes[0].body, /remediation-green/);
  assert.deepEqual(Object.keys(state.writes[0]).sort(), ['body', 'issueId']);
});
test('records a recurring warning as red even before a deployed repair exists', async () => {
  const { state, options } = fixture();
  options.log = `${WARNING}\nCompiled successfully`;
  options.source.logSha256 = createHash('sha256')
    .update(options.log)
    .digest('hex');
  state.production.status = 'unknown';
  const result = await recordDeprecationObservations(options);
  assert.equal(result.results[0].status, 'red');
  assert.doesNotMatch(state.writes[0].body, /remediation-green/);
});
for (const name of [
  'unverified',
  'different-build',
  'no-binding',
  'open-pull',
  'unmerged',
  'not-contained',
  'partial-comments',
  'partial-attachments',
  'invalid-fingerprint',
  'changed-issue',
  'nonimplementing-pull',
])
  test(`holds ${name} instead of inferring absence`, async () => {
    const { state, options } = fixture();
    if (name === 'unverified') state.production.status = 'pending';
    if (name === 'different-build') state.production.sha = MERGE;
    if (name === 'no-binding') state.issue.attachments.nodes = [];
    if (name === 'open-pull') state.pull.state = 'open';
    if (name === 'unmerged') state.pull.merged = false;
    if (name === 'not-contained') state.contains = false;
    if (name === 'partial-comments')
      state.issue.comments.pageInfo.hasNextPage = true;
    if (name === 'partial-attachments')
      state.issue.attachments.pageInfo.hasNextPage = true;
    if (name === 'invalid-fingerprint') state.issue.title = 'unrelated';
    if (name === 'changed-issue') state.changed = true;
    if (name === 'nonimplementing-pull')
      state.pull.title = 'unrelated reference';
    const result = await recordDeprecationObservations(options);
    assert.equal(result.results[0].action, 'hold');
    assert.equal(state.writes.length, 0);
  });
for (const name of [
  'partial-log',
  'empty-web-log',
  'no-web-build',
  'wrong-digest',
  'empty-jobs',
  'wrong-run-url',
  'wrong-event',
  'wrong-workflow',
  'failed-run',
  'wrong-head',
  'invalid-time',
  'missing-job',
  'malformed-jobs',
  'paginated-jobs-incomplete',
  'partial-inventory',
  'comment-failure',
  'readback-failure',
])
  test(`fails closed on ${name}`, async () => {
    const { state, options } = fixture();
    if (name === 'empty-web-log') {
      options.log = '';
      options.source.logSha256 = createHash('sha256').update('').digest('hex');
    }
    if (name === 'no-web-build')
      state.jobs[0].name = 'Build and verify runner image offline';
    if (name === 'partial-log') options.source.complete = false;
    if (name === 'wrong-digest') options.source.logSha256 = 'wrong';
    if (name === 'empty-jobs') options.source.jobIds = [];
    if (name === 'wrong-run-url')
      options.source.runUrl = 'https://evil.test/run/123';
    if (name === 'wrong-event') state.run.event = 'push';
    if (name === 'wrong-workflow') state.run.path = 'other.yml';
    if (name === 'failed-run') state.run.conclusion = 'failure';
    if (name === 'wrong-head') state.run.head_sha = MERGE;
    if (name === 'invalid-time') state.run.updated_at = 'invalid';
    if (name === 'missing-job') options.source.jobIds.push(2);
    if (name === 'malformed-jobs') state.badJobs = true;
    if (name === 'paginated-jobs-incomplete') state.jobsMore = true;
    if (name === 'partial-inventory') state.inventoryMore = true;
    if (name === 'comment-failure')
      options.comment = async () => ({ ok: false, id: '' });
    if (name === 'readback-failure') state.badReadback = true;
    await assert.rejects(recordDeprecationObservations(options));
  });
test('same-run replay and newer observations do not write again', async () => {
  for (const newer of [false, true]) {
    const { state, options } = fixture();
    state.issue.comments.nodes = [
      {
        body: formatDeprecationObservation({
          ...observation(
            'red',
            newer ? '2026-10-07T13:00:00Z' : '2026-10-07T12:00:00Z'
          ),
          status: newer ? 'red' : 'green',
          runUrl: newer
            ? 'https://github.com/JovieInc/Jovie/actions/runs/124'
            : RUN,
        }),
      },
    ];
    const result = await recordDeprecationObservations(options);
    assert.equal(result.results[0].action, newer ? 'hold' : 'replay');
    assert.equal(state.writes.length, 0);
  }
});
test('bounded oldest-first processing reports deferred issues', async () => {
  const { state, options } = fixture();
  const issues = Array.from({ length: 27 }, (_, i) => ({
    ...state.issue,
    id: `id-${i}`,
    identifier: `JOV-${i + 1}`,
    updatedAt: `2026-10-${String(i + 1).padStart(2, '0')}T11:00:00Z`,
  }));
  options.linear = async query =>
    query.includes('DeprecationObservations')
      ? {
          issues: { nodes: issues.reverse(), pageInfo: { hasNextPage: false } },
        }
      : { issue: null };
  const result = await recordDeprecationObservations(options);
  assert.equal(result.results.length, MAX_OBSERVATIONS);
  assert.equal(result.results[0].issue, 'JOV-1');
  assert.equal(result.deferred, 2);
});
test('latest source observation controls recurrence regardless of comment delivery order; ties hold red', () => {
  const comments = [
    observation('red', '2026-10-07T13:00:00Z'),
    observation('green'),
  ].map(v => ({ body: formatDeprecationObservation(v) }));
  const issue = {
    identifier: 'JOV-7877',
    title: `[${FP}]`,
    commentRecords: comments,
  };
  assert.equal(deprecationCheckGreen(issue), false);
  assert.equal(
    deprecationCheckGreen({ ...issue, commentRecords: comments.reverse() }),
    false
  );
  assert.equal(
    deprecationCheckGreen({
      ...issue,
      commentRecords: [
        { body: formatDeprecationObservation(observation('green')) },
      ],
    }),
    true
  );
  assert.equal(
    deprecationCheckGreen({
      ...issue,
      commentRecords: [
        { body: formatDeprecationObservation(observation('green')) },
        { body: formatDeprecationObservation(observation('red')) },
      ],
    }),
    false
  );
  assert.equal(deprecationCheckGreen({ ...issue, identifier: 'JOV-2' }), null);
  assert.equal(deprecationCheckGreen({ title: 'other' }), null);
  assert.equal(deprecationCheckGreen({}), null);
});
test('malformed or foreign observations cannot grant green', () => {
  for (const body of [
    '',
    '<!-- deprecation-observation:v1 {}',
    '<!-- deprecation-observation:v1 nope -->',
    '<!-- deprecation-observation:v1 {} -->',
  ])
    assert.equal(parseDeprecationObservation(body), null);
  for (const [key, value] of Object.entries({
    schema: 'other',
    issue: 'other',
    fingerprint: 'other',
    status: 'Done',
    headSha: 'short',
    observedAt: 'bad',
    runUrl: 'https://evil.test',
  })) {
    const item = { ...observation(), [key]: value };
    assert.throws(() => formatDeprecationObservation(item));
  }
  const issue = {
    identifier: 'JOV-7877',
    title: `[${FP}]`,
    commentRecords: [
      { body: 'bad' },
      {
        body: formatDeprecationObservation({
          ...observation(),
          fingerprint: 'deprecation-ffffffffffff',
        }),
      },
    ],
  };
  assert.equal(deprecationCheckGreen(issue), null);
});
test('CLI requires existing scoped credentials and inputs', async () => {
  await assert.rejects(runDeprecationClearance([], {}), /required/);
});
test('real runner/CI selector enforces the new operational coverage path', () => {
  assert.match(DEPRECATION_COVERAGE_COMMAND, /--test-coverage-lines=90/);
  assert.match(
    SCRIPT_CONTRACT_NODE_COMMAND,
    /deprecation-clearance\.test\.mjs/
  );
  const workflow = readFileSync(
    new URL('../.github/workflows/deprecation-intake.yml', import.meta.url),
    'utf8'
  );
  assert.match(workflow, /Incomplete build log[\s\S]*exit 1/);
  assert.match(workflow, /complete:true/);
  assert.match(workflow, /timeout 90s node scripts\/deprecation-clearance/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github.token \}\}/);
});
test('installed CLI composition writes and reads back scoped evidence through the real adapters', async () => {
  const { state, options } = fixture();
  const dir = mkdtempSync(join(tmpdir(), 'jovie-deprecation-'));
  const logPath = join(dir, 'build.log'),
    sourcePath = join(dir, 'source.json');
  writeFileSync(logPath, LOG);
  writeFileSync(sourcePath, JSON.stringify(options.source));
  const old = process.env.LINEAR_COOLDOWN_STATE_DIR;
  process.env.LINEAR_COOLDOWN_STATE_DIR = join(dir, 'cooldown');
  let unavailable = false;
  const fetchImpl = async (input, init) => {
    const url = String(input);
    let payload;
    if (url === 'https://api.linear.app/graphql') {
      if (unavailable)
        return new Response(
          JSON.stringify({ errors: [{ message: 'unavailable' }] }),
          { status: 200 }
        );
      const { query, variables } = JSON.parse(init.body);
      if (query.includes('AddLinearIssueComment')) {
        state.writes.push({ body: variables.body });
        payload = {
          commentCreate: { success: true, comment: { id: 'comment' } },
        };
      } else payload = await options.linear(query);
      return new Response(JSON.stringify({ data: payload }), { status: 200 });
    }
    if (url.includes('jov.ie/api/version')) payload = { buildId: SHA };
    else if (url.includes('/actions/artifacts?'))
      payload = {
        artifacts: [
          {
            expired: false,
            name: `production-generation-verified-${SHA}`,
            workflow_run: { head_branch: 'main' },
          },
        ],
      };
    else if (url.includes('/commits/')) payload = { sha: SHA };
    else if (url.includes('/compare/')) payload = { status: 'ahead' };
    else payload = (await options.github(url)).body;
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  try {
    const result = await runDeprecationClearance(
      [logPath, sourcePath],
      { LINEAR_API_KEY: 'test-key', GH_TOKEN: 'test-github' },
      fetchImpl
    );
    assert.equal(result.results[0].status, 'green');
    assert.equal(state.writes.length, 1);
    unavailable = true;
    await assert.rejects(
      runDeprecationClearance(
        [logPath, sourcePath],
        { LINEAR_API_KEY: 'test-key', GH_TOKEN: 'test-github' },
        fetchImpl
      ),
      /linear-unavailable/
    );
  } finally {
    if (old === undefined) delete process.env.LINEAR_COOLDOWN_STATE_DIR;
    else process.env.LINEAR_COOLDOWN_STATE_DIR = old;
    rmSync(dir, { recursive: true, force: true });
  }
});
