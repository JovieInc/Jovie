// Retry evidence the Test Flakiness Report reads beyond CI step outcomes:
// JUnit and Playwright JSON retries (flakiness-report-parsers.js) and PR-head
// unit retries from Source Validation runs (JOV-12621).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const flakiness = require('./analyze-test-flakiness');
const { clusterFailureRecords, parseJunitXml, parsePlaywrightJsonReport } =
  flakiness;

function withFakeGitHub(routes, fn) {
  const original = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    const requestPath = `${url.pathname}${url.search}`;
    paths.push(requestPath);
    const route = routes(requestPath);
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return Promise.resolve(fn(paths)).finally(() => {
    globalThis.fetch = original;
  });
}

test('parseJunitXml extracts failures and flaky retries', () => {
  const xml = `<?xml version="1.0"?>
  <testsuite name="x">
    <testcase name="ok" file="tests/unit/a.test.ts" classname="a"/>
    <testcase name="bad" file="tests/unit/b.test.ts" classname="b">
      <failure message="boom">AssertionError: expected 1 to be 2</failure>
    </testcase>
    <testcase name="flaky" file="tests/unit/c.test.ts" classname="c">
      <flakyFailure message="flaked">Error: timeout 3000ms</flakyFailure>
    </testcase>
  </testsuite>`;
  const recs = parseJunitXml(xml);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].kind, 'failure');
  assert.equal(recs[0].file, 'tests/unit/b.test.ts');
  assert.equal(recs[1].kind, 'flaky-retry');
});

test('a terminal JUnit failure with retry history is never a successful flaky retry', () => {
  const xml =
    '<testsuite><testcase name="broken" file="tests/unit/x.test.ts"><flakyFailure>timeout</flakyFailure><failure>still broken</failure></testcase></testsuite>';
  assert.deepEqual(
    parseJunitXml(xml).map(r => r.kind),
    ['failure']
  );
});

// JOV-12621: Affected Unit Tests runs on PR heads with --retry, so its
// retried-then-passed tests only exist in Source Validation runs.
test('a retried pass in a Source Validation unit-flaky artifact reaches the report', async t => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-flaky-cache-'));
  t.mock.method(console, 'warn', () => {});
  flakiness.setRunEvidenceCacheDir(cacheDir);
  const routes = p => {
    if (p.includes('/actions/workflows/ci.yml/runs?'))
      return { body: { workflow_runs: [{ id: 30, run_attempt: 1 }] } };
    if (p.includes('/actions/workflows/source-validation.yml/runs?'))
      return {
        body: {
          workflow_runs: [{ id: 41, run_attempt: 1, event: 'pull_request' }],
        },
      };
    if (p.includes('/runs/41/artifacts'))
      return { body: { artifacts: [{ name: 'unit-flaky-41-1-2' }] } };
    return { body: p.includes('/jobs') ? { jobs: [] } : { artifacts: [] } };
  };
  const downloads = [];
  const download = (runId, _repo, dest) => {
    downloads.push(runId);
    const artifact = path.join(dest, 'unit-flaky-41-1-2');
    fs.mkdirSync(artifact, { recursive: true });
    fs.writeFileSync(
      path.join(artifact, 'test-report.3-4.flaky.json'),
      JSON.stringify({
        schemaVersion: 2,
        flaky: [{ file: 'apps/web/a.test.ts', name: 'races', retryCount: 1 }],
      })
    );
    return true;
  };
  try {
    const { paths, result } = await withFakeGitHub(routes, async calls => ({
      paths: calls,
      result: await flakiness.analyzeFlakiness('t', 'JovieInc', 'Jovie', {
        download,
      }),
    }));
    assert.ok(
      paths.some(p =>
        p.startsWith(
          '/repos/JovieInc/Jovie/actions/workflows/source-validation.yml/runs?'
        )
      )
    );
    const svPath = paths.find(p => p.includes('source-validation.yml'));
    assert.ok(svPath.includes('event=pull_request'));
    assert.ok(svPath.includes('status=completed'));
    // Only the run that uploaded unit-flaky-* is downloaded.
    assert.deepEqual(downloads, [41]);
    const stats = result.unitStats.get('Unit › apps/web/a.test.ts › races');
    assert.deepEqual([...stats.runIds], ['41']);
    assert.equal(result.unitRunsAnalyzed, 2);
    const flaky = flakiness.calculateUnitRetryFlakes(
      result.unitStats,
      result.unitRunsAnalyzed
    );
    assert.equal(flaky.length, 1);
    assert.equal(flaky[0].retries, 1);
  } finally {
    flakiness.setRunEvidenceCacheDir('');
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('an unreadable Source Validation run list never blocks the CI report', async t => {
  flakiness.setRunEvidenceCacheDir(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sv-flaky-down-'))
  );
  t.mock.method(console, 'warn', () => {});
  const routes = p => {
    if (p.includes('/actions/workflows/ci.yml/runs?'))
      return { body: { workflow_runs: [{ id: 31, run_attempt: 1 }] } };
    if (p.includes('source-validation.yml')) return { status: 502, body: {} };
    return { body: p.includes('/jobs') ? { jobs: [] } : { artifacts: [] } };
  };
  try {
    const result = await withFakeGitHub(routes, () =>
      flakiness.analyzeFlakiness('t', 'JovieInc', 'Jovie', {
        download: () => assert.fail('nothing to download'),
      })
    );
    assert.equal(result.totalRuns, 1);
    assert.equal(result.unitRunsAnalyzed, 1);
    assert.equal(result.unitStats.size, 0);
  } finally {
    flakiness.setRunEvidenceCacheDir('');
  }
});

// Playwright's JUnit reporter writes <flakyFailure> only with includeRetries
// (PLAYWRIGHT_JUNIT_INCLUDE_RETRIES); by default a retried pass is a plain
// passing <testcase>. Its JSON reporter always records status "flaky".
test('parsePlaywrightJsonReport counts Playwright flaky statuses as retried passes', () => {
  const report = {
    config: { rootDir: '/w/apps/web/tests/e2e' },
    stats: { expected: 1, unexpected: 1, flaky: 1, skipped: 0 },
    suites: [
      {
        title: 'profile.spec.ts',
        file: 'profile.spec.ts',
        specs: [],
        suites: [
          {
            title: 'profile',
            file: 'profile.spec.ts',
            specs: [
              {
                title: 'renders',
                file: 'profile.spec.ts',
                tests: [
                  {
                    projectName: 'chromium',
                    status: 'flaky',
                    results: [
                      {
                        retry: 0,
                        status: 'timedOut',
                        errors: [{ message: 'Timeout 30000ms exceeded.' }],
                      },
                      { retry: 1, status: 'passed', errors: [] },
                    ],
                  },
                ],
              },
              {
                title: 'stable',
                file: 'profile.spec.ts',
                tests: [
                  {
                    projectName: 'chromium',
                    status: 'expected',
                    results: [{ retry: 0, status: 'passed', errors: [] }],
                  },
                ],
              },
              {
                title: 'broken',
                file: 'profile.spec.ts',
                tests: [
                  {
                    projectName: 'chromium',
                    status: 'unexpected',
                    results: [
                      {
                        retry: 0,
                        status: 'failed',
                        errors: [{ message: 'expected visible' }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const records = parsePlaywrightJsonReport(report);
  assert.deepEqual(
    records.map(r => [r.kind, r.testId]),
    [
      ['flaky-retry', 'profile.spec.ts::[chromium] profile › renders'],
      ['failure', 'profile.spec.ts::[chromium] profile › broken'],
    ]
  );
  assert.equal(records[0].error, 'Timeout 30000ms exceeded.');
  // Anything that is not a Playwright JSON report is ignored.
  assert.deepEqual(
    parsePlaywrightJsonReport({ schemaVersion: 2, flaky: [] }),
    []
  );
  assert.deepEqual(parsePlaywrightJsonReport(null), []);
  // Clustered, a flaky status counts as a successful retry.
  const [cluster] = clusterRecords(records.slice(0, 1));
  assert.equal(cluster.flakyRetries, 1);
});

function clusterRecords(records) {
  const now = Date.parse('2026-11-14T12:00:00Z');
  return clusterFailureRecords(
    records.map(r => ({
      ...r,
      runId: 1,
      runAttempt: 1,
      runUrl: 'u',
      runEvent: 'push',
      runAt: '2026-11-14T11:00:00Z',
    })),
    now
  );
}

test('parseJunitXml counts Playwright flakyError retries too', () => {
  const xml =
    '<testsuite><testcase name="t" classname="e2e/a.spec.ts"><flakyError message="net"><stackTrace>Error: net::ERR</stackTrace></flakyError></testcase></testsuite>';
  assert.deepEqual(
    parseJunitXml(xml).map(r => r.kind),
    ['flaky-retry']
  );
});
