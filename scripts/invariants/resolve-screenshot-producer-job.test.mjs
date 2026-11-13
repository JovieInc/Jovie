import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ProducerJobDeferredError,
  resolveProducerJobId,
  resolveProducerJobIdWithHold,
  selectProducerJobId,
  UNKNOWN_PRODUCER_JOB_NAME,
} from './resolve-screenshot-producer-job.mjs';
import { PRODUCER } from './screen-proof-resolver.mjs';

const producer = (id, conclusion = 'success') => ({
  name: PRODUCER.job,
  id,
  conclusion,
});

/** Narrow to the pending member so property reads stay inside the union. */
const asPending = result => (result?.status === 'pending' ? result : null);
/** Narrow to the resolved member so property reads stay inside the union. */
const asResolved = result => (result?.status === 'resolved' ? result : null);

test('selectProducerJobId accepts only Generate Screenshots', () => {
  assert.deepEqual(selectProducerJobId({ jobs: [producer(42)] }), {
    status: 'resolved',
    id: '42',
  });
  assert.equal(
    selectProducerJobId({
      jobs: [
        { name: UNKNOWN_PRODUCER_JOB_NAME, id: 99, conclusion: 'success' },
      ],
    }).status,
    'pending'
  );
  assert.equal(
    asPending(
      selectProducerJobId({
        jobs: [
          { name: UNKNOWN_PRODUCER_JOB_NAME, id: 99, conclusion: 'success' },
        ],
      })
    )?.reason,
    'unknown-job'
  );
  assert.equal(
    asPending(selectProducerJobId({ jobs: [] }))?.reason,
    'missing-producer'
  );
  assert.equal(
    selectProducerJobId({ jobs: [producer(1), producer(2)] }).status,
    'rejected'
  );
  assert.notEqual(
    asResolved(
      selectProducerJobId({
        jobs: [{ name: UNKNOWN_PRODUCER_JOB_NAME, id: 99 }],
      })
    )?.id,
    '99'
  );
});

test('resolveProducerJobId waits through unknown-job then accepts the real name', async () => {
  const payloads = [
    { jobs: [{ name: UNKNOWN_PRODUCER_JOB_NAME, id: 7, conclusion: null }] },
    { jobs: [producer(88)] },
  ];
  let reads = 0;
  const result = await resolveProducerJobId({
    delays: [0, 0],
    fetchJobs: async () => payloads[reads++] ?? payloads.at(-1),
    sleep: async () => undefined,
  });
  assert.deepEqual(result, { status: 'resolved', id: '88' });
  assert.equal(reads, 2);
});

test('resolveProducerJobId does not accept a permanent unknown-job', async () => {
  let reads = 0;
  const result = await resolveProducerJobId({
    delays: [0, 0, 0],
    fetchJobs: async () => {
      reads += 1;
      return {
        jobs: [
          { name: UNKNOWN_PRODUCER_JOB_NAME, id: 7, conclusion: 'success' },
        ],
      };
    },
    sleep: async () => undefined,
  });
  assert.deepEqual(result, { status: 'pending', reason: 'unknown-job' });
  assert.equal(reads, 3);
});

test('screenshot workflow resolves the producer job through the retry helper', () => {
  const workflow = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      '../../.github/workflows/screenshots.yml'
    ),
    'utf8'
  );
  assert.equal(
    workflow.includes('select(.name == "Generate Screenshots")'),
    false
  );
  assert.equal(workflow.includes('resolve-screenshot-producer-job.mjs'), true);
  assert.equal(workflow.includes(UNKNOWN_PRODUCER_JOB_NAME), false);
});

test('the hold runner retries a quota deferral and resolves when the budget recovers', async () => {
  let reads = 0;
  let clock = 0;
  const id = await resolveProducerJobIdWithHold({
    fetchJobs: async () => {
      reads += 1;
      if (reads < 3) throw new ProducerJobDeferredError();
      return { jobs: [producer(42)] };
    },
    holdBudgetMs: 10 * 60_000,
    intervalMs: 30_000,
    now: () => {
      clock += 35_000;
      return clock;
    },
    sleep: async () => undefined,
    lagSleep: async () => undefined,
  });
  assert.equal(id.id, '42');
  assert.equal(reads, 3);
});

test('the hold runner still exits deferred when the budget cannot recover (no green-wash)', async () => {
  let clock = 0;
  await assert.rejects(
    resolveProducerJobIdWithHold({
      fetchJobs: async () => {
        throw new ProducerJobDeferredError();
      },
      holdBudgetMs: 8 * 60_000,
      intervalMs: 30_000,
      now: () => {
        clock += 31_000;
        return clock;
      },
      sleep: async () => undefined,
      lagSleep: async () => undefined,
    }),
    error => error instanceof ProducerJobDeferredError
  );
});

test('the hold runner keeps real resolution failures loud (not deferred)', async () => {
  await assert.rejects(
    resolveProducerJobIdWithHold({
      fetchJobs: async () => ({ jobs: [] }),
      holdBudgetMs: 60_000,
      intervalMs: 1_000,
      now: () => Date.now(),
      sleep: async () => undefined,
      lagSleep: async () => undefined,
    }),
    /Could not resolve the current producer job ID/
  );
});
