import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { buildQuarantineEvidence } from '../.github/scripts/collect-quarantine-evidence.mjs';
import {
  fileQuarantineClusters,
  fileReportedFlakeClusters,
} from './file-quarantine-clusters.mjs';

const { retryFailureRecords, clusterFailureRecords } = createRequire(
  import.meta.url
)('../.github/scripts/analyze-test-flakiness.js');

const now = Date.parse('2026-10-03T12:00:00Z'),
  headSha = 'a'.repeat(40),
  hash = 'b'.repeat(64);
const file = 'apps/web/tests/unit/example.test.ts';
/** @typedef {{schemaVersion:number,complete?:boolean,run?:Record<string,unknown>,executions?:Array<Record<string,unknown>>,entries?:unknown[],flaky?:Array<{file:string,name:string,retryCount:number}>}} RetryReport */
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

async function filingFixture() {
  const f = fixture();
  for (const { artifacts } of f.bundles) {
    const report = artifacts[0].reports[0];
    report.flaky = [{ file, name: 'retries once', retryCount: 1 }];
    report.executions[0].failures = [
      {
        name: 'retries once',
        error: 'timeout on port 12345',
        outcome: 'flaky',
      },
    ];
  }
  const records = await retryFailureRecords(f.bundles, now);
  const clusters = clusterFailureRecords(records, now);
  const created = new Map(),
    comments = [],
    plans = [];
  const options = {
    ...f.options,
    clusters: { ...f.options.clusters, clusters },
    upsert: async plan => {
      plans.push(plan);
      if (!created.has(plan.fingerprint))
        created.set(plan.fingerprint, {
          id: 'issue-id',
          url: 'https://linear.app/jovie/issue/JOV-42',
        });
      return { ok: true, ...created.get(plan.fingerprint) };
    },
    list: async () => ({ ok: true, comments }),
    comment: async plan => {
      comments.push(plan);
      return { ok: true, id: `comment-${comments.length}` };
    },
  };
  return { ...f, records, created, comments, plans, options };
}

test('verified retry artifacts file one signature and idempotent recurrence comments without recovery history', async () => {
  const f = await filingFixture();
  assert.equal(f.records.length, 3);
  const cluster = f.options.clusters.clusters[0];
  assert.equal(cluster.quarantineCandidate, true);
  delete f.options.report; // This path cannot write/release a ledger entry.
  const result = await fileReportedFlakeClusters(f.options);
  assert.deepEqual(result, {
    [cluster.signature]: 'https://linear.app/jovie/issue/JOV-42',
  });
  await fileReportedFlakeClusters(f.options);
  assert.equal(f.created.size, 1);
  assert.equal(f.comments.length, 1);
  assert.match(f.plans[0].description, /Owning area: example.test.ts/);
  assert.match(f.plans[0].description, /First seen: 2026-10-03/);
  assert.match(f.plans[0].description, /rolling 24h: 3/);
  assert.match(f.plans[0].description, /actions\/runs\/3/);
  assert.equal(f.plans[0].reopenTerminal, true);
  cluster.flakyAttempts24h.push({
    runId: 4,
    runAttempt: 1,
    runAt: new Date(now).toISOString(),
  });
  cluster.flakyRunAttempts24h++;
  await fileReportedFlakeClusters(f.options);
  assert.equal(f.created.size, 1);
  assert.equal(f.comments.length, 2);
});

test('ten shard copies of one retry and terminal failures remain diagnostic, not filing candidates', async () => {
  const f = await filingFixture();
  const records = Array.from({ length: 10 }, (_, i) => ({
    ...f.records[0],
    artifactShard: String(i),
  }));
  for (const sample of [
    records,
    f.records.map(row => ({ ...row, kind: 'failure' })),
  ]) {
    const clusters = clusterFailureRecords(sample, now);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].quarantineCandidate, false);
    f.options.clusters.clusters = clusters;
    assert.deepEqual(await fileReportedFlakeClusters(f.options), {});
    assert.equal(f.created.size, 0);
  }
});

test('partial, skipped, legacy and terminal execution receipts cannot create successful retry signatures', async () => {
  for (const kind of ['partial', 'skipped', 'legacy', 'terminal']) {
    const f = await filingFixture();
    for (const { artifacts } of f.bundles) {
      const report = artifacts[0].reports[0];
      if (kind === 'partial') report.complete = false;
      if (kind === 'skipped') report.executions[0].skippedCount = 1;
      if (kind === 'legacy') report.schemaVersion = 1;
      if (kind === 'terminal') report.executions[0].outcome = 'failed';
    }
    assert.deepEqual(await retryFailureRecords(f.bundles, now), [], kind);
  }
});

test('missing recovered errors use an explicit test-specific signature and foreign artifacts are rejected', async () => {
  const f = await filingFixture();
  for (const { artifacts } of f.bundles)
    artifacts[0].reports[0].executions[0].failures = [];
  const records = await retryFailureRecords(f.bundles, now);
  assert.equal(records.length, 3);
  assert.match(records[0].error, /failure message unavailable/);
  assert.equal(clusterFailureRecords(records, now).length, 1);
  f.bundles[0].artifacts[0].reports[0].run.headSha = 'd'.repeat(40);
  await assert.rejects(
    retryFailureRecords(f.bundles, now),
    /Unbound execution report/
  );
});

test('malformed, stale, duplicate or foreign signature evidence fails before any Linear write', async () => {
  for (const mutate of [
    o => {
      o.clusters.repository = 'foreign/repo';
    },
    o => {
      o.clusters.headSha = 'd'.repeat(40);
    },
    o => {
      o.clusters.generatedAt = '2026-10-01T00:00:00Z';
    },
    o => {
      o.clusters.clusters[0].file = '../unsafe.test.ts';
    },
    o => {
      o.clusters.clusters[0].flakyAttempts24h[0].runAt = '2026-10-01T00:00:00Z';
    },
    o => {
      o.clusters.clusters[0].flakyAttempts24h[0] =
        o.clusters.clusters[0].flakyAttempts24h[1];
    },
    o => {
      o.clusters.clusters[0].flakyAttempts24h.pop();
    },
  ]) {
    const f = await filingFixture();
    mutate(f.options);
    await assert.rejects(fileReportedFlakeClusters(f.options));
    assert.equal(f.created.size, 0);
  }
});

test('filing and recurrence errors remain visible and source drift prevents writes', async () => {
  for (const kind of ['lease', 'upsert', 'inventory', 'comment']) {
    const f = await filingFixture();
    if (kind === 'lease')
      f.options.lease = () => {
        throw new Error('source drift');
      };
    if (kind === 'upsert') f.options.upsert = async () => ({ ok: false });
    if (kind === 'inventory')
      f.options.list = async () => ({ ok: false, comments: [] });
    if (kind === 'comment')
      f.options.comment = async () => ({ ok: false, id: '' });
    await assert.rejects(fileReportedFlakeClusters(f.options));
    if (kind === 'lease') assert.equal(f.created.size, 0);
  }
});
