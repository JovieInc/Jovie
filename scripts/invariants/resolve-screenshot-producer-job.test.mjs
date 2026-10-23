import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PRODUCER } from './screen-proof-resolver.mjs';
import {
  resolveProducerJobId,
  selectProducerJobId,
  UNKNOWN_PRODUCER_JOB_NAME,
} from './resolve-screenshot-producer-job.mjs';

const producer = (id, conclusion = 'success') => ({
  name: PRODUCER.job,
  id,
  conclusion,
});

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
    selectProducerJobId({
      jobs: [
        { name: UNKNOWN_PRODUCER_JOB_NAME, id: 99, conclusion: 'success' },
      ],
    }).reason,
    'unknown-job'
  );
  assert.equal(selectProducerJobId({ jobs: [] }).reason, 'missing-producer');
  assert.equal(
    selectProducerJobId({ jobs: [producer(1), producer(2)] }).status,
    'rejected'
  );
  assert.notEqual(
    selectProducerJobId({
      jobs: [{ name: UNKNOWN_PRODUCER_JOB_NAME, id: 99 }],
    }).id,
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
