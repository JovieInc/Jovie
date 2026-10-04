const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAttemptOneOutcomes,
  buildWorkflowRunsApiPath,
  calculateMetrics,
  extractTestExecutions,
  MAIN_BRANCH,
  normalizeJobName,
  shouldCountAsRetry,
} = require('./analyze-test-flakiness');

test('buildWorkflowRunsApiPath scopes flakiness analysis to main branch', () => {
  const apiPath = buildWorkflowRunsApiPath('JovieInc', 'Jovie');

  assert.ok(apiPath.includes('branch=main'));
  assert.ok(apiPath.includes('status=completed'));
  assert.ok(apiPath.includes('per_page=30'));
  assert.equal(MAIN_BRANCH, 'main');
});

test('normalizeJobName strips matrix shard suffixes', () => {
  assert.equal(normalizeJobName('Unit Tests (1/3)'), 'Unit Tests');
  assert.equal(normalizeJobName('Unit Tests (2/3)'), 'Unit Tests');
  assert.equal(normalizeJobName('Unit Tests (packages/ui)'), 'Unit Tests');
  assert.equal(normalizeJobName('E2E Tests'), 'E2E Tests');
  assert.equal(normalizeJobName('Lint (other/pkg)'), 'Lint (other/pkg)');
});

test('extractTestExecutions keeps packages/ui step history under Unit Tests', () => {
  const job = {
    name: 'Unit Tests (packages/ui)',
    conclusion: 'success',
    steps: [
      { name: 'Run unit tests', conclusion: 'skipped' },
      { name: 'Run packages/ui unit tests', conclusion: 'success' },
    ],
  };

  assert.deepEqual(extractTestExecutions(job), [
    { name: 'Unit Tests › Run packages/ui unit tests', conclusion: 'success' },
  ]);
});

test('extractTestExecutions normalizes matrix job names in step-level output', () => {
  const job = {
    name: 'Unit Tests (3/3)',
    conclusion: 'failure',
    steps: [{ name: 'Run unit tests', conclusion: 'failure' }],
  };

  assert.deepEqual(extractTestExecutions(job), [
    { name: 'Unit Tests › Run unit tests', conclusion: 'failure' },
  ]);
});

test('extractTestExecutions prefers explicit test run steps', () => {
  const job = {
    name: 'Unit Tests',
    conclusion: 'failure',
    steps: [
      { name: 'Checkout', conclusion: 'success' },
      { name: 'Run unit tests', conclusion: 'success' },
      { name: 'Run quarantined unit tests (retries)', conclusion: 'failure' },
    ],
  };

  assert.deepEqual(extractTestExecutions(job), [
    { name: 'Unit Tests › Run unit tests', conclusion: 'success' },
    {
      name: 'Unit Tests › Run quarantined unit tests (retries)',
      conclusion: 'failure',
    },
  ]);
});

test('extractTestExecutions falls back to job-level outcome when no test steps exist', () => {
  const job = {
    name: 'E2E Tests',
    conclusion: 'success',
    steps: [{ name: 'Setup Node', conclusion: 'success' }],
  };

  assert.deepEqual(extractTestExecutions(job), [
    { name: 'E2E Tests', conclusion: 'success' },
  ]);
});

test('extractTestExecutions returns empty when test steps exist but are skipped/cancelled', () => {
  const job = {
    name: 'Unit Tests',
    conclusion: 'failure',
    steps: [
      { name: 'Checkout', conclusion: 'success' },
      { name: 'Install deps', conclusion: 'failure' },
      { name: 'Run unit tests', conclusion: 'skipped' },
      { name: 'Run quarantined unit tests (retries)', conclusion: 'cancelled' },
    ],
  };

  // Test steps exist but were skipped — should NOT fall back to job-level failure
  assert.deepEqual(extractTestExecutions(job), []);
});

test('shouldCountAsRetry only attributes workflow retries to failed attempt-1 steps', () => {
  assert.equal(
    shouldCountAsRetry({
      attemptOneConclusion: 'failure',
      runAttempt: 2,
      conclusion: 'success',
    }),
    true
  );
  assert.equal(
    shouldCountAsRetry({
      attemptOneConclusion: 'success',
      runAttempt: 2,
      conclusion: 'success',
    }),
    false
  );
  assert.equal(
    shouldCountAsRetry({
      attemptOneConclusion: undefined,
      runAttempt: 2,
      conclusion: 'success',
    }),
    false
  );
});

test('buildAttemptOneOutcomes records only first workflow attempts', () => {
  const unitJob = {
    name: 'Unit Tests (1/6)',
    conclusion: 'success',
    steps: [
      { name: 'Run unit tests', conclusion: 'failure' },
      { name: 'Run packages/ui unit tests', conclusion: 'success' },
    ],
  };

  const outcomes = buildAttemptOneOutcomes([
    {
      run: { head_sha: 'sha-a', run_attempt: 1 },
      jobs: [unitJob],
    },
    {
      run: { head_sha: 'sha-a', run_attempt: 2 },
      jobs: [unitJob],
    },
  ]);

  assert.deepEqual(
    [...outcomes.get('sha-a').entries()],
    [
      ['Unit Tests › Run unit tests', 'failure'],
      ['Unit Tests › Run packages/ui unit tests', 'success'],
    ]
  );
});

test('calculateMetrics does not flag stable steps with workflow-only retries', () => {
  const testStats = new Map([
    [
      'Unit Tests › Run unit tests',
      { failures: 1, successes: 68, retries: 0, runs: 69, lastFailure: null },
    ],
    [
      'Unit Tests › Run quarantined unit tests (retries)',
      { failures: 0, successes: 68, retries: 0, runs: 68, lastFailure: null },
    ],
    [
      'Unit Tests › Run packages/ui unit tests',
      { failures: 0, successes: 68, retries: 0, runs: 68, lastFailure: null },
    ],
  ]);

  const flaky = calculateMetrics(testStats);

  assert.equal(flaky.length, 0);
});

test('extractTestExecutions ignores setup failures when test steps were skipped', () => {
  const setupFailureJob = {
    name: 'Unit Tests (2/3)',
    conclusion: 'failure',
    steps: [
      { name: 'Setup Node.js and pnpm', conclusion: 'failure' },
      { name: 'Run unit tests', conclusion: 'skipped' },
    ],
  };

  assert.deepEqual(extractTestExecutions(setupFailureJob), []);
});

test('calculateMetrics flags only tests above thresholds', () => {
  const testStats = new Map([
    [
      'Stable Test',
      { failures: 1, successes: 30, retries: 0, runs: 31, lastFailure: null },
    ],
    [
      'Flaky Unit Tests',
      { failures: 3, successes: 24, retries: 0, runs: 27, lastFailure: null },
    ],
  ]);

  const flaky = calculateMetrics(testStats);

  assert.equal(flaky.length, 1);
  assert.equal(flaky[0].name, 'Flaky Unit Tests');
  assert.equal(flaky[0].failureRate, '11.1');
});

const {
  normalizeFailureText,
  failureSignature,
  parseJunitXml,
  clusterFailureRecords,
} = require('./analyze-test-flakiness');

test('normalizeFailureText strips volatile tokens', () => {
  const a = normalizeFailureText(
    'Error at 2026-09-21T10:00:00Z port 45123 uuid 123e4567-e89b-42d3-a456-426614174000 took 342ms'
  );
  const b = normalizeFailureText(
    'Error at 2026-09-22T11:11:11Z port 8080 uuid 999e4567-e89b-42d3-a456-426614174999 took 12ms'
  );
  assert.equal(a, b);
});

test('failureSignature is stable across shards and timestamps', () => {
  const s1 = failureSignature(
    'tests/unit/x.test.ts::does thing',
    'TypeError: jsYaml.load is not a function (1/10) at 2026-09-21T00:00:00Z'
  );
  const s2 = failureSignature(
    'tests/unit/x.test.ts::does thing',
    'TypeError: jsYaml.load is not a function (5/10) at 2026-09-22T00:00:00Z'
  );
  assert.equal(s1, s2);
});

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

test('clusterFailureRecords merges cross-shard failures into one incident', () => {
  const now = new Date().toISOString();
  const records = [];
  for (let shard = 1; shard <= 10; shard++) {
    records.push({
      testId: 'tests/unit/d.test.ts::loads',
      file: 'tests/unit/d.test.ts',
      name: 'loads',
      kind: 'failure',
      error: `TypeError: jsYaml.load is not a function (${shard}/10)`,
      runId: 100 + shard,
      runUrl: `https://example/run/${shard}`,
      runEvent: 'pull_request',
      runAt: now,
    });
  }
  const clusters = clusterFailureRecords(records);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].occurrences, 10);
  assert.equal(clusters[0].occurrences24h, 10);
  assert.equal(clusters[0].quarantineCandidate, false);
  assert.equal(clusters[0].mergeGroupOnly, false);
});

test('clusterFailureRecords flags merge-group-only signatures', () => {
  const now = new Date().toISOString();
  const records = [
    {
      testId: 'tests/unit/e.test.ts::x',
      file: 'tests/unit/e.test.ts',
      name: 'x',
      kind: 'failure',
      error: 'resolution drift',
      runId: 1,
      runUrl: 'u1',
      runEvent: 'merge_group',
      runAt: now,
    },
    {
      testId: 'tests/unit/e.test.ts::x',
      file: 'tests/unit/e.test.ts',
      name: 'x',
      kind: 'failure',
      error: 'resolution drift',
      runId: 2,
      runUrl: 'u2',
      runEvent: 'push',
      runAt: now,
    },
  ];
  const clusters = clusterFailureRecords(records);
  assert.equal(clusters[0].mergeGroupOnly, false);
  const mgOnly = clusterFailureRecords([records[0]]);
  assert.equal(mgOnly[0].mergeGroupOnly, true);
});

test('quarantine candidacy requires three distinct successful retry run attempts in the current window', () => {
  const now = new Date().toISOString();
  const record = {
    testId: 'tests/unit/x.test.ts::retry',
    file: 'tests/unit/x.test.ts',
    kind: 'flaky-retry',
    error: 'timed out',
    runId: 1,
    runAttempt: 1,
    runUrl: 'u1',
    runEvent: 'push',
    runAt: now,
  };
  const repeated = Array.from({ length: 10 }, (_, i) => ({
    ...record,
    artifactShard: String(i),
  }));
  assert.equal(clusterFailureRecords(repeated)[0].quarantineCandidate, false);
  const distinct = [1, 2, 3].map(runId => ({
    ...record,
    runId,
    runUrl: `u${runId}`,
  }));
  assert.equal(clusterFailureRecords(distinct)[0].quarantineCandidate, true);
  assert.equal(
    clusterFailureRecords(
      distinct.map(r => ({ ...r, runAt: '2000-01-01T00:00:00Z' }))
    )[0].quarantineCandidate,
    false
  );
  assert.equal(
    clusterFailureRecords(
      distinct.map(r => ({ ...r, runAt: '2999-01-01T00:00:00Z' }))
    )[0].quarantineCandidate,
    false
  );
});

test('a terminal JUnit failure with retry history is never a successful flaky retry', () => {
  const xml =
    '<testsuite><testcase name="broken" file="tests/unit/x.test.ts"><flakyFailure>timeout</flakyFailure><failure>still broken</failure></testcase></testsuite>';
  assert.deepEqual(
    parseJunitXml(xml).map(r => r.kind),
    ['failure']
  );
});

// JOV-7744: completed-run evidence is read from the shared GITHUB_TOKEN quota
// once per (run id, attempt), not once per report wake.
function withFakeGitHub(routes, fn) {
  const https = require('node:https');
  const { EventEmitter } = require('node:events');
  const original = https.get;
  const paths = [];
  https.get = (options, onResponse) => {
    paths.push(options.path);
    const route = routes(options.path);
    const res = new EventEmitter();
    res.statusCode = route.status ?? 200;
    process.nextTick(() => {
      onResponse(res);
      res.emit('data', JSON.stringify(route.body ?? {}));
      res.emit('end');
    });
    return new EventEmitter();
  };
  return Promise.resolve(fn(paths)).finally(() => {
    https.get = original;
  });
}

test('a repeat wake reads only the run list; a new run costs only its own evidence', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const flakiness = require('./analyze-test-flakiness');
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-cache-'));
  flakiness.setRunEvidenceCacheDir(cacheDir);
  let runs = [1, 2].map(id => ({ id, run_attempt: 1, conclusion: 'success' }));
  const routes = p =>
    p.includes('/actions/workflows/ci.yml/runs?')
      ? { body: { workflow_runs: runs } }
      : { body: p.includes('/jobs') ? { jobs: [] } : { artifacts: [] } };
  try {
    const first = await withFakeGitHub(routes, async paths => {
      await flakiness.analyzeFlakiness('t', 'JovieInc', 'Jovie');
      return paths;
    });
    assert.equal(first.length, 5);
    const second = await withFakeGitHub(routes, async paths => {
      await flakiness.analyzeFlakiness('t', 'JovieInc', 'Jovie');
      return paths;
    });
    assert.deepEqual(second, [first[0]]);
    runs = [{ id: 3, run_attempt: 1, conclusion: 'success' }, ...runs];
    const third = await withFakeGitHub(routes, async paths => {
      await flakiness.analyzeFlakiness('t', 'JovieInc', 'Jovie');
      return paths;
    });
    assert.deepEqual(third.slice(1).sort(), [
      '/repos/JovieInc/Jovie/actions/runs/3/artifacts?per_page=100',
      '/repos/JovieInc/Jovie/actions/runs/3/jobs',
    ]);
    // A rerun is new evidence: attempt 2 of run 1 is read again.
    runs = runs.map(r => (r.id === 1 ? { ...r, run_attempt: 2 } : r));
    const rerun = await withFakeGitHub(routes, async paths => {
      await flakiness.analyzeFlakiness('t', 'JovieInc', 'Jovie');
      return paths;
    });
    assert.equal(rerun.filter(p => p.includes('/runs/1/')).length, 2);
  } finally {
    flakiness.setRunEvidenceCacheDir('');
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('a failed artifact read is never cached and still downloads that run', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const flakiness = require('./analyze-test-flakiness');
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-cache-'));
  flakiness.setRunEvidenceCacheDir(cacheDir);
  const runs = [
    { id: 7, run_attempt: 1 },
    { id: 8, run_attempt: 1 },
    { id: 9, run_attempt: 1 },
  ];
  let failing = true;
  const routes = p => {
    if (p.includes('/runs/7/') && failing) return { status: 502, body: {} };
    if (p.includes('/runs/8/'))
      return { body: { artifacts: [{ name: 'unit-flaky-3-1-0' }] } };
    return { body: { artifacts: [{ name: 'repo-health-receipt' }] } };
  };
  try {
    const selected = await withFakeGitHub(routes, () =>
      flakiness.runsWithUnitFlakeArtifacts('t', 'JovieInc', 'Jovie', runs)
    );
    assert.deepEqual(
      selected.map(r => r.id),
      [7, 8]
    );
    failing = false;
    const retried = await withFakeGitHub(routes, async paths => {
      await flakiness.runsWithUnitFlakeArtifacts(
        't',
        'JovieInc',
        'Jovie',
        runs
      );
      return paths;
    });
    assert.deepEqual(retried, [
      '/repos/JovieInc/Jovie/actions/runs/7/artifacts?per_page=100',
    ]);
  } finally {
    flakiness.setRunEvidenceCacheDir('');
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

for (const failure of ['mkdir', 'write']) {
  test(`a ${failure} cache failure retains fetched report evidence and retries next wake`, async t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const flakiness = require('./analyze-test-flakiness');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-cache-failure-'));
    const dir = path.join(root, 'evidence');
    if (failure === 'mkdir') {
      fs.writeFileSync(dir, 'not a directory');
    } else {
      fs.mkdirSync(dir);
      for (const kind of ['jobs', 'artifacts']) {
        fs.mkdirSync(path.join(dir, `${kind}-27-1.json`));
      }
    }
    const warn = t.mock.method(console, 'warn', () => {});
    flakiness.setRunEvidenceCacheDir(dir);
    const run = { id: 27, run_attempt: 1, conclusion: 'failure' };
    const routes = p =>
      p.includes('/actions/workflows/ci.yml/runs?')
        ? { body: { workflow_runs: [run] } }
        : p.endsWith('/jobs')
          ? {
              body: {
                jobs: [
                  {
                    name: 'Unit Tests',
                    steps: [{ name: 'Run unit tests', conclusion: 'failure' }],
                  },
                ],
              },
            }
          : { body: { artifacts: [] } };
    try {
      for (let wake = 0; wake < 2; wake++) {
        const paths = await withFakeGitHub(routes, async calls => {
          const report = await flakiness.analyzeFlakiness(
            't',
            'JovieInc',
            'Jovie'
          );
          assert.equal(report.totalRuns, 1);
          assert.equal(report.runsWithFailures, 1);
          assert.equal(
            report.testStats.get('Unit Tests › Run unit tests').failures,
            1
          );
          return calls;
        });
        assert.equal(paths.length, 3);
        assert.ok(paths.includes('/repos/JovieInc/Jovie/actions/runs/27/jobs'));
        assert.ok(
          paths.includes(
            '/repos/JovieInc/Jovie/actions/runs/27/artifacts?per_page=100'
          )
        );
      }
      assert.equal(warn.mock.callCount(), 4);
    } finally {
      flakiness.setRunEvidenceCacheDir('');
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

for (const failure of ['eviction', 'digest']) {
  test(`a cache ${failure} failure skips the save key and self heals when the filesystem recovers`, t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { boundRunEvidenceCache } = require('./analyze-test-flakiness');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-maintenance-'));
    const corrupt = path.join(
      dir,
      `jobs-${failure === 'eviction' ? 1 : 2}-1.json`
    );
    const valid = path.join(
      dir,
      `jobs-${failure === 'eviction' ? 2 : 1}-1.json`
    );
    const warn = t.mock.method(console, 'warn', () => {});
    try {
      fs.mkdirSync(corrupt);
      fs.writeFileSync(valid, '[]');
      assert.equal(boundRunEvidenceCache(dir, 1), null);
      assert.equal(warn.mock.callCount(), 1);
      assert.ok(fs.statSync(corrupt).isDirectory());
      fs.rmSync(corrupt, { recursive: true });
      fs.writeFileSync(valid, '[]');
      const digest = boundRunEvidenceCache(dir, 1);
      assert.match(digest, /^[0-9a-f]{16}$/);
      assert.equal(boundRunEvidenceCache(dir, 1), digest);
      assert.equal(warn.mock.callCount(), 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('the evidence cache keeps the newest runs and keys on content', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { boundRunEvidenceCache } = require('./analyze-test-flakiness');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-bound-'));
  try {
    for (const id of [5, 40, 300, 12])
      fs.writeFileSync(path.join(dir, `jobs-${id}-1.json`), `[${id}]`);
    const first = boundRunEvidenceCache(dir, 2);
    assert.deepEqual(fs.readdirSync(dir).sort(), [
      'jobs-300-1.json',
      'jobs-40-1.json',
    ]);
    assert.match(first, /^[0-9a-f]{16}$/);
    assert.equal(boundRunEvidenceCache(dir, 2), first);
    fs.writeFileSync(path.join(dir, 'jobs-40-1.json'), '[41]');
    assert.notEqual(boundRunEvidenceCache(dir, 2), first);
    assert.equal(boundRunEvidenceCache(path.join(dir, 'missing')), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
