import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import {
  buildQuarantineEvidence,
  collectArtifacts,
  collectCiHistory,
  collectPaged,
} from './collect-quarantine-evidence.mjs';

const now = Date.parse('2026-10-03T12:00:00Z');
const sha = 'a'.repeat(40);
const hash = 'b'.repeat(64);
const file = 'apps/web/tests/unit/example.test.ts';
const options = { headSha: sha, now };
function bundle(id = 1, override = {}) {
  const run = {
    id,
    run_attempt: 1,
    head_sha: sha,
    status: 'completed',
    event: 'merge_group',
    repository: 'JovieInc/Jovie',
    created_at: '2026-10-03T11:00:00Z',
  };
  const report = {
    schemaVersion: 2,
    complete: true,
    run: {
      repository: run.repository,
      headSha: sha,
      runId: id,
      runAttempt: 1,
      event: run.event,
    },
    executions: [
      {
        file,
        fileHash: hash,
        executedCount: 2,
        skippedCount: 0,
        retryCount: 0,
        complete: true,
        outcome: 'clean',
        ...override,
      },
    ],
  };
  const artifact = {
    id: id + 100,
    expired: false,
    name: `unit-flaky-${id}-1-unit-1-14`,
    workflow_run: { id, head_sha: sha },
  };
  return { run, artifacts: [{ artifact, reports: [report] }] };
}
test('binds real run and artifact metadata onto eligible observations', () => {
  const result = buildQuarantineEvidence([bundle()], options);
  assert.equal(result.complete, true);
  assert.equal(result.observations.length, 1);
  assert.deepEqual(result.observations[0], {
    repository: 'JovieInc/Jovie',
    file,
    fileHash: hash,
    headSha: sha,
    runId: 1,
    runAttempt: 1,
    event: 'merge_group',
    runAt: '2026-10-03T11:00:00Z',
    artifactId: 101,
    artifactVerified: true,
    executedCount: 2,
    skippedCount: 0,
    retryCount: 0,
    outcome: 'clean',
  });
});
test('partial, skipped, unknown and changed-shape execution blocks older clean observations for that file', () => {
  for (const override of [
    { complete: false },
    { skippedCount: 1 },
    { executedCount: 0 },
    { fileHash: 'missing' },
    { retryCount: -1 },
    { outcome: 'unknown' },
    { retryCount: 1 },
    { outcome: 'flaky' },
  ]) {
    const result = buildQuarantineEvidence(
      [bundle(1), bundle(2, override)],
      options
    );
    assert.equal(result.observations.length, 0);
    assert.deepEqual(result.blockedFiles, [file]);
  }
});
test('a failing execution remains visible and unrelated complete files survive partial results', () => {
  const b = bundle(2, { outcome: 'failed' });
  const partial = bundle(3, {
    file: 'apps/web/tests/unit/other.test.ts',
    complete: false,
  });
  assert.equal(
    buildQuarantineEvidence([b, partial], options).observations[0].outcome,
    'failed'
  );
});
test('legacy empty reports never count as clean executions', () => {
  const b = bundle();
  b.artifacts[0].reports = [{ schemaVersion: 1, flaky: [] }];
  assert.deepEqual(buildQuarantineEvidence([b], options).observations, []);
});
test('rejects foreign runs, PR events, incomplete statuses, impossible times and duplicate run attempts', () => {
  for (const changes of [
    { id: 0 },
    { run_attempt: 0 },
    { head_sha: 'missing' },
    { status: 'in_progress' },
    { event: 'pull_request' },
    { repository: 'other/repo' },
    { created_at: 'invalid' },
    { created_at: '2026-10-04T00:00:00Z' },
  ]) {
    const b = bundle();
    Object.assign(b.run, changes);
    assert.throws(() => buildQuarantineEvidence([b], options));
  }
  assert.throws(
    () => buildQuarantineEvidence([bundle(), bundle()], options),
    /Duplicate run/
  );
});
test('rejects unbound, expired, duplicate and missing artifacts', () => {
  for (const changes of [
    { id: 0 },
    { expired: true },
    { name: 'unit-flaky-999-1-job' },
    { workflow_run: { id: 999, head_sha: sha } },
    { workflow_run: { id: 1, head_sha: 'c'.repeat(40) } },
  ]) {
    const b = bundle();
    Object.assign(b.artifacts[0].artifact, changes);
    assert.throws(() => buildQuarantineEvidence([b], options));
  }
  const b = bundle();
  b.artifacts.push(b.artifacts[0]);
  assert.throws(
    () => buildQuarantineEvidence([b], options),
    /Duplicate or invalid artifact/
  );
  b.artifacts = [{ artifact: bundle().artifacts[0].artifact, reports: [] }];
  assert.throws(
    () => buildQuarantineEvidence([b], options),
    /Missing execution/
  );
});
test('rejects unknown schemas and report identity mismatches', () => {
  for (const change of [
    { schemaVersion: 3 },
    { executions: {} },
    { run: { repository: 'foreign/repo' } },
    {
      run: { ...bundle().artifacts[0].reports[0].run, headSha: 'c'.repeat(40) },
    },
  ]) {
    const b = bundle();
    Object.assign(b.artifacts[0].reports[0], change);
    assert.throws(
      () => buildQuarantineEvidence([b], options),
      /Unbound execution report/
    );
  }
});
test('rejects duplicate executions and ignores traversal or non-ledger files', () => {
  const b = bundle();
  b.artifacts[0].reports[0].executions.push(
    b.artifacts[0].reports[0].executions[0]
  );
  assert.throws(
    () => buildQuarantineEvidence([b], options),
    /Duplicate test execution/
  );
  for (const file of [
    '../a.test.ts',
    'apps/web/tests/../a.test.ts',
    'apps/web/lib/a.test.ts',
    'apps/web/tests/e2e/a.spec.ts',
    'apps/web/tests/unit/a.test.ts\\bad',
  ])
    assert.equal(
      buildQuarantineEvidence([bundle(1, { file })], options).observations
        .length,
      0
    );
});
test('paginates complete collections and rejects truncation, drifting totals and duplicates', () => {
  const all = Array.from({ length: 101 }, (_, id) => ({ id }));
  let calls = 0;
  const result = collectPaged(
    'repos/r/actions/runs?event=push',
    'runs',
    endpoint => {
      calls++;
      assert.match(endpoint, /&per_page=100&page=/);
      return {
        total_count: 101,
        runs: endpoint.endsWith('page=1') ? all.slice(0, 100) : all.slice(100),
      };
    }
  );
  assert.equal(result.length, 101);
  assert.equal(calls, 2);
  for (const api of [
    () => ({ total_count: 1001, runs: [] }),
    () => ({ total_count: 2, runs: [{ id: 1 }] }),
    () => ({ total_count: 2, runs: [{ id: 1 }, { id: 1 }] }),
    () => ({ total_count: 1 }),
    endpoint => ({
      total_count: endpoint.endsWith('page=1') ? 101 : 102,
      runs: endpoint.endsWith('page=1') ? all.slice(0, 100) : all.slice(100),
    }),
  ])
    assert.throws(() => collectPaged('repos/r/actions/runs', 'runs', api));
  assert.deepEqual(
    collectPaged('repos/r/actions/runs', 'runs', () => ({
      total_count: 0,
      runs: [],
    })),
    []
  );
});
test('restarts a drifting collection from page one without retaining old rows', () => {
  const rows = Array.from({ length: 102 }, (_, id) => ({ id: id + 1000 }));
  const calls = [];
  let attempt = 0;
  const result = collectPaged('repos/r/actions/runs', 'runs', endpoint => {
    const page = endpoint.endsWith('page=1') ? 1 : 2;
    calls.push(page);
    if (page === 1) attempt++;
    if (attempt === 1)
      return {
        total_count: page === 1 ? 101 : 102,
        runs:
          page === 1 ? Array.from({ length: 100 }, (_, id) => ({ id })) : [],
      };
    return {
      total_count: rows.length,
      runs: page === 1 ? rows.slice(0, 100) : rows.slice(100),
    };
  });
  assert.deepEqual(calls, [1, 2, 1, 2]);
  assert.deepEqual(result, rows);
});

test('stops after three drifting snapshots and never returns partial evidence', () => {
  let calls = 0;
  assert.throws(
    () =>
      collectPaged('repos/r/actions/runs', 'runs', endpoint => {
        calls++;
        return {
          total_count: endpoint.endsWith('page=1') ? 101 : 102,
          runs: endpoint.endsWith('page=1')
            ? Array.from({ length: 100 }, (_, id) => ({ id }))
            : [{ id: 100 }],
        };
      }),
    /Collection changed during pagination/
  );
  assert.equal(calls, 6);
});

test('does not retry malformed, truncated, over-budget or failed API responses', () => {
  for (const value of [
    { total_count: 1001, runs: [] },
    { total_count: 2, runs: [{ id: 1 }] },
    { total_count: 1 },
    {
      total_count: 101,
      runs: Array.from({ length: 101 }, (_, id) => ({ id })),
    },
    new Error('API unavailable'),
  ]) {
    let calls = 0;
    assert.throws(() =>
      collectPaged('repos/r/actions/runs', 'runs', () => {
        calls++;
        if (value instanceof Error) throw value;
        return value;
      })
    );
    assert.equal(calls, 1);
  }
});

function zipBytes(entries) {
  return execFileSync(
    'python3',
    [
      '-c',
      'import io,json,sys,zipfile\nb=io.BytesIO()\nwith zipfile.ZipFile(b,"w") as z:\n for name,content in json.load(sys.stdin): z.writestr(name,content)\nsys.stdout.buffer.write(b.getvalue())',
    ],
    { input: JSON.stringify(entries) }
  );
}
test('actual ZIP reader consumes JSON via bounded pipes and refuses traversal members', () => {
  const b = bundle();
  const api = () => ({ total_count: 1, artifacts: [b.artifacts[0].artifact] });
  const execute = bytes => (bin, args) => {
    assert.equal(bin, 'gh');
    assert.deepEqual(args, [
      'api',
      'repos/JovieInc/Jovie/actions/artifacts/101/zip',
    ]);
    return bytes;
  };
  const reports = collectArtifacts(
    [b.run],
    api,
    execute(
      zipBytes([
        [
          'test-report.1-14.flaky.json',
          JSON.stringify(b.artifacts[0].reports[0]),
        ],
      ])
    )
  );
  assert.equal(
    buildQuarantineEvidence(reports, options).observations.length,
    1
  );
  for (const entries of [
    [['../report.flaky.json', '{}']],
    [['report.js', 'throw 1']],
    [['test-report.flaky.json', 'not json']],
  ])
    assert.throws(() =>
      collectArtifacts([b.run], api, execute(zipBytes(entries)))
    );
});

test('collects both complete event histories up to 2,000 runs without truncation', () => {
  const calls = [];
  const api = endpoint => {
    calls.push(endpoint);
    const event = endpoint.includes('event=push') ? 'push' : 'merge_group';
    const page = Number(endpoint.match(/&page=(\d+)$/)[1]);
    return {
      total_count: 1000,
      workflow_runs: Array.from({ length: 100 }, (_, i) => ({
        id: (event === 'push' ? 0 : 1000) + (page - 1) * 100 + i + 1,
      })),
    };
  };
  const runs = collectCiHistory(178737329, now, api);
  assert.equal(runs.length, 2000);
  assert.equal(new Set(runs.map(r => r.id)).size, 2000);
  assert.equal(calls.length, 20);
  assert.ok(
    calls.every(call => call.includes('created=%3E%3D2026-09-26T12:00:00.000Z'))
  );
  assert.throws(() => collectCiHistory(0, now, api));
  assert.throws(
    () =>
      collectCiHistory(1, now, () => ({
        total_count: 1001,
        workflow_runs: [],
      })),
    /Incomplete API collection/
  );
});
