import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildQuarantineEvidence } from '../.github/scripts/collect-quarantine-evidence.mjs';
import { fileQuarantineClusters } from './file-quarantine-clusters.mjs';

const now = Date.parse('2026-10-03T12:00:00Z'),
  headSha = 'a'.repeat(40),
  hash = 'b'.repeat(64);
const file = 'apps/web/tests/unit/example.test.ts';
/** @typedef {{schemaVersion:number,complete?:boolean,run?:Record<string,unknown>,executions?:Array<Record<string,unknown>>,entries?:unknown[]}} RetryReport */
const ledger = {
  schemaVersion: 1,
  retryBudget: {
    unitShardCount: 14,
    unitDefaultRetries: 1,
    quarantineUnitRetries: 2,
    e2eDefaultRetries: 0,
    quarantineE2eRetries: 2,
    maxRetryAttemptsPerCiRun: 160,
  },
  entries: [],
};
function fixture() {
  const bundles = [1, 2, 3].map(id => ({
    run: {
      id,
      run_attempt: 1,
      head_sha: headSha,
      status: 'completed',
      event: 'merge_group',
      repository: 'JovieInc/Jovie',
      created_at: '2026-10-03T11:00:00Z',
    },
    artifacts: [
      {
        artifact: {
          id: id + 100,
          expired: false,
          name: `unit-flaky-${id}-1-0`,
          workflow_run: { id, head_sha: headSha },
        },
        reports: /** @type {RetryReport[]} */ ([
          {
            schemaVersion: 2,
            complete: true,
            run: {
              repository: 'JovieInc/Jovie',
              headSha,
              runId: id,
              runAttempt: 1,
              event: 'merge_group',
            },
            executions: [
              {
                file,
                fileHash: hash,
                complete: true,
                executedCount: 1,
                skippedCount: 0,
                retryCount: 1,
                outcome: 'flaky',
              },
            ],
          },
        ]),
      },
    ],
  }));
  const report = buildQuarantineEvidence(bundles, { headSha, now });
  const cluster = {
    signature: 'c'.repeat(16),
    file,
    testId: `${file}::retry`,
    errorExcerpt: 'fixture failure',
    quarantineCandidate: true,
    runUrls: ['https://github.com/JovieInc/Jovie/actions/runs/1'],
  };
  const clusters = {
    schemaVersion: 1,
    repository: 'JovieInc/Jovie',
    headSha,
    generatedAt: new Date(now).toISOString(),
    clusters: [cluster],
  };
  const calls = [],
    leases = [];
  const options = {
    report,
    clusters,
    ledger,
    headSha,
    now,
    fileHash: () => hash,
    lease: () => {
      leases.push(true);
    },
    upsert: async plan => {
      calls.push(plan);
      return { ok: true, url: 'https://linear.app/jovie/issue/JOV-42' };
    },
  };
  return { options, calls, leases, bundles, cluster };
}

test('deduplicates a root-cause signature and maps only the canonical Linear receipt', async () => {
  const f = fixture();
  f.options.clusters.clusters.push({ ...f.cluster });
  const issues = await fileQuarantineClusters(f.options);
  assert.deepEqual(issues, { [file]: 'https://linear.app/jovie/issue/JOV-42' });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].fingerprint, `deflake:signature:${'c'.repeat(16)}`);
  assert.equal(f.calls[0].reopenTerminal, true);
  assert.equal(f.leases.length, 2);
});

test('partial, skipped, legacy, insufficient and changed-hash executions cannot file a quarantine incident', async () => {
  for (const kind of ['partial', 'skipped', 'legacy', 'insufficient', 'hash']) {
    const f = fixture();
    if (kind === 'insufficient') f.bundles.pop();
    if (kind === 'partial')
      f.bundles[0].artifacts[0].reports[0].complete = false;
    if (kind === 'skipped')
      f.bundles[0].artifacts[0].reports[0].executions[0].skippedCount = 1;
    if (kind === 'legacy')
      for (const b of f.bundles)
        b.artifacts[0].reports = [{ schemaVersion: 1, entries: [] }];
    if (kind === 'hash') f.options.fileHash = () => 'd'.repeat(64);
    f.options.report = buildQuarantineEvidence(f.bundles, { headSha, now });
    assert.deepEqual(await fileQuarantineClusters(f.options), {});
    assert.equal(f.calls.length, 0, kind);
  }
});

test('foreign, stale or malformed cluster and execution identities fail before Linear writes', async () => {
  for (const mutate of [
    f => {
      f.options.clusters.repository = 'foreign/repo';
    },
    f => {
      f.options.clusters.headSha = 'd'.repeat(40);
    },
    f => {
      f.options.clusters.generatedAt = '2026-10-01T00:00:00Z';
    },
    f => {
      f.cluster.runUrls = ['https://example.test/run'];
    },
    f => {
      f.options.report.observations[0].artifactVerified = false;
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(fileQuarantineClusters(f.options));
    assert.equal(f.calls.length, 0);
  }
});

test('source drift and unsuccessful or foreign Linear responses produce no issue map', async () => {
  for (const kind of ['before', 'after', 'failed', 'foreign']) {
    const f = fixture();
    let count = 0;
    if (kind === 'before' || kind === 'after')
      f.options.lease = () => {
        if (++count === (kind === 'before' ? 1 : 2))
          throw new Error('source drift');
      };
    else
      f.options.upsert = async () => ({
        ok: kind !== 'failed',
        url: 'https://github.com/JovieInc/Jovie/issues/42',
      });
    await assert.rejects(fileQuarantineClusters(f.options));
    if (kind === 'before') assert.equal(f.calls.length, 0);
  }
});
