import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertRunnableRecord,
  buildRunFile,
  COLLECTOR_ENTRYPOINT,
  maybeRetry,
  RECORD_COMMAND,
  REPORT_COMMAND,
  runRecordFromEvent,
} from '../../flake-ledger-workflow-hook.mjs';

const WORKFLOW = readFileSync(
  new URL('../../../.github/workflows/flake-ledger.yml', import.meta.url),
  'utf8'
);
const HOOK = readFileSync(
  new URL('../../flake-ledger-workflow-hook.mjs', import.meta.url),
  'utf8'
);
const LANES = readFileSync(
  new URL('../../ci-fast-lanes.mjs', import.meta.url),
  'utf8'
);

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);

function eventPayload(overrides = {}) {
  return {
    workflow_run: {
      id: 44554154244,
      run_attempt: 1,
      path: '.github/workflows/source-validation.yml',
      event: 'pull_request',
      conclusion: 'failure',
      head_sha: HEAD,
      actor: { login: 'ci-bot' },
      triggering_actor: { login: 'ci-bot' },
      created_at: '2026-11-19T00:00:00Z',
      run_started_at: '2026-11-19T00:00:01Z',
      updated_at: '2026-11-19T00:01:00Z',
      head_repository: { full_name: 'JovieInc/Jovie' },
      pull_requests: [{ head: { sha: HEAD }, base: { sha: BASE } }],
      ...overrides,
    },
  };
}

function writeEvent(payload) {
  const dir = mkdtempSync(join(tmpdir(), 'flake-ledger-wf-'));
  const eventPath = join(dir, 'event.json');
  writeFileSync(eventPath, `${JSON.stringify(payload)}\n`);
  return { dir, eventPath, outDir: join(dir, 'out') };
}

test('workflow_run completed collector is event-driven and limited to Source Validation', () => {
  assert.match(
    WORKFLOW,
    /\n {2}workflow_run:\n {4}workflows: \[Source Validation\]\n {4}types: \[completed\]/
  );
  assert.doesNotMatch(WORKFLOW, /\bschedule:/);
  assert.doesNotMatch(WORKFLOW, /\bpoll\b/);
  assert.match(WORKFLOW, /workflow_run\.event == 'pull_request'/);
  assert.match(
    WORKFLOW,
    /workflow_run\.path == '\.github\/workflows\/source-validation\.yml'/
  );
});

test('the workflow calls the HA collector entrypoint and does not reimplement flips in YAML', () => {
  assert.match(
    WORKFLOW,
    new RegExp(RECORD_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.match(
    WORKFLOW,
    new RegExp(REPORT_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  );
  assert.match(
    WORKFLOW,
    /scripts\/flake-ledger-workflow-hook\.mjs build-run-file/
  );
  assert.match(
    WORKFLOW,
    /scripts\/flake-ledger-workflow-hook\.mjs maybe-retry/
  );
  assert.equal(COLLECTOR_ENTRYPOINT, 'scripts/lib/flake-ledger.mjs');
  assert.doesNotMatch(WORKFLOW, /run_attempt\s*>\s*1 and now green/);
  assert.doesNotMatch(WORKFLOW, /if:.*run_attempt\s*>\s*1/);
  assert.doesNotMatch(HOOK, /rate = verified flips/);
});

test('permissions stay minimal and the runner is already-pinned ubuntu-24.04', () => {
  assert.match(WORKFLOW, /\npermissions: \{\}\n/);
  assert.match(WORKFLOW, /runs-on: ubuntu-24\.04/);
  assert.doesNotMatch(WORKFLOW, /ubuntu-latest/);
  assert.doesNotMatch(WORKFLOW, /contents:\s*write/);
  assert.doesNotMatch(WORKFLOW, /pull-requests:\s*write/);
  assert.match(WORKFLOW, /actions:\s*write/);
  assert.doesNotMatch(WORKFLOW, /continue-on-error:/);
  assert.doesNotMatch(WORKFLOW, /runs-on: \[self-hosted/);
});

test('the contract is registered in the script-contract lane', () => {
  assert.match(
    LANES,
    /scripts\/lib\/__tests__\/flake-ledger-workflow\.test\.mjs/
  );
});

test('runRecordFromEvent keys the record on (head, base) and keeps attempt identity', () => {
  const record = runRecordFromEvent(eventPayload());
  assert.equal(record.headSha, HEAD);
  assert.equal(record.baseSha, BASE);
  assert.equal(record.runId, 44554154244);
  assert.equal(record.runAttempt, 1);
  assert.equal(record.workflowPath, '.github/workflows/source-validation.yml');
  assertRunnableRecord(record);
});

test('build-run-file writes the event record without API when no read token is present', async () => {
  const { eventPath, outDir } = writeEvent(eventPayload());
  const calls = [];
  const result = await buildRunFile(
    {
      eventPath,
      repository: 'JovieInc/Jovie',
      outDir,
      now: '2026-11-19T00:01:00Z',
    },
    {
      request: async path => (
        calls.push(path), { ok: true, status: 200, data: { jobs: [] } }
      ),
    }
  );
  assert.equal(calls.length, 0);
  assert.equal(result.record.baseSha, BASE);
  assert.equal(result.record.headSha, HEAD);
  const written = JSON.parse(readFileSync(join(outDir, 'run.json'), 'utf8'));
  assert.equal(written.runId, 44554154244);
  const meta = JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8'));
  assert.equal(meta.triggeringActorLogin, 'ci-bot');
});

test('build-run-file fetches attempt 1 of the same run when recording a later attempt', async () => {
  const { eventPath, outDir } = writeEvent(
    eventPayload({ run_attempt: 2, conclusion: 'success' })
  );
  const result = await buildRunFile(
    {
      eventPath,
      repository: 'JovieInc/Jovie',
      token: 'read-token',
      outDir,
      now: '2026-11-19T00:02:00Z',
    },
    {
      request: async path => {
        if (path.includes('/attempts/1/jobs'))
          return {
            ok: true,
            status: 200,
            data: {
              jobs: [
                {
                  name: 'Unit Tests',
                  conclusion: 'failure',
                  steps: [{ name: 'Run tests', conclusion: 'failure' }],
                },
              ],
            },
          };
        if (path.endsWith('/attempts/1'))
          return {
            ok: true,
            status: 200,
            data: { conclusion: 'failure', updated_at: '2026-11-19T00:01:00Z' },
          };
        if (path.includes('/attempts/2/jobs'))
          return { ok: true, status: 200, data: { jobs: [] } };
        throw new Error(`unexpected ${path}`);
      },
    }
  );
  assert.equal(result.meta.attempt1Conclusion, 'failure');
  const attempt1 = JSON.parse(
    readFileSync(join(outDir, 'attempt1.json'), 'utf8')
  );
  assert.equal(attempt1.runAttempt, 1);
  assert.equal(attempt1.conclusion, 'failure');
  assert.equal(attempt1.headSha, HEAD);
  assert.equal(attempt1.baseSha, BASE);
  assert.ok(attempt1.failedSubjects.includes('job:Unit Tests'));
  assert.ok(attempt1.failedSubjects.includes('step:Unit Tests::Run tests'));
  assert.equal(result.record.conclusion, 'success');
  assert.equal(result.record.runAttempt, 2);
});

test('maybe-retry never reruns test assertions or a lone PR Ready failure', async () => {
  const { eventPath, outDir, dir } = writeEvent(eventPayload());
  const posts = [];
  const denied = await maybeRetry(
    {
      eventPath,
      repository: 'JovieInc/Jovie',
      readToken: 'read',
      writeToken: 'write',
      outDir,
      ledgerPath: join(dir, 'ledger.json'),
      root: dir,
    },
    {
      exists: path =>
        path.endsWith('scripts/lib/flake-ledger.mjs') ||
        path.endsWith('ledger.json'),
      importCollector: async () => ({
        classifyRerunEligibility: () => ({
          retryable: false,
          kind: 'test-assertion',
          reason: 'assertion',
        }),
        canRetry: () => ({ allowed: true }),
        recordRetry: ledger => ({ ledger }),
      }),
      request: async (path, opts) => {
        if (opts?.method === 'POST') posts.push(path);
        if (path.includes('/jobs'))
          return {
            ok: true,
            status: 200,
            data: {
              jobs: [
                {
                  id: 1,
                  name: 'Unit Tests',
                  conclusion: 'failure',
                  steps: [{ name: 'Run tests', conclusion: 'failure' }],
                },
              ],
            },
          };
        if (path.includes('/annotations'))
          return {
            ok: true,
            status: 200,
            data: [{ message: 'AssertionError: expected 1 to be 2' }],
          };
        return { ok: true, status: 200, data: {} };
      },
    }
  );
  assert.equal(denied.retried, false);
  assert.equal(denied.reason, 'classifier-denied');
  assert.equal(posts.length, 0);

  const readyOnly = await maybeRetry(
    {
      eventPath,
      repository: 'JovieInc/Jovie',
      readToken: 'read',
      writeToken: 'write',
      outDir,
      ledgerPath: join(dir, 'ledger-ready.json'),
      root: dir,
    },
    {
      exists: path => path.endsWith('scripts/lib/flake-ledger.mjs'),
      importCollector: async () => {
        throw new Error('classifier must not run for PR Ready-only failures');
      },
      request: async (path, opts) => {
        if (opts?.method === 'POST') posts.push(path);
        return {
          ok: true,
          status: 200,
          data: {
            jobs: [
              { id: 9, name: 'PR Ready', conclusion: 'failure', steps: [] },
            ],
          },
        };
      },
    }
  );
  assert.equal(readyOnly.reason, 'pr-ready-only-left-to-fleet-rules');
  assert.equal(posts.length, 0);
});

test('maybe-retry requests one rerun only for classified infrastructure failures', async () => {
  const { eventPath, outDir, dir } = writeEvent(eventPayload());
  const posts = [];
  const retried = await maybeRetry(
    {
      eventPath,
      repository: 'JovieInc/Jovie',
      readToken: 'read',
      writeToken: 'write',
      outDir,
      ledgerPath: join(dir, 'ledger.json'),
      root: dir,
      now: Date.parse('2026-11-19T00:01:00Z'),
    },
    {
      exists: path =>
        path.endsWith('scripts/lib/flake-ledger.mjs') ||
        path.endsWith('ledger.json'),
      importCollector: async () => ({
        classifyRerunEligibility: () => ({
          retryable: true,
          kind: 'transient-infrastructure',
          reason: 'runner lost',
        }),
        canRetry: () => ({ allowed: true }),
        recordRetry: ledger => ({
          ledger: { ...ledger, retries: [{ at: '2026-11-19T00:01:00Z' }] },
        }),
      }),
      request: async (path, opts) => {
        if (opts?.method === 'POST') {
          posts.push(path);
          return { ok: true, status: 201, data: {} };
        }
        if (path.includes('/jobs'))
          return {
            ok: true,
            status: 200,
            data: {
              jobs: [
                {
                  id: 2,
                  name: 'Checkout',
                  conclusion: 'failure',
                  steps: [{ name: 'Checkout', conclusion: 'failure' }],
                },
              ],
            },
          };
        if (path.includes('/annotations'))
          return {
            ok: true,
            status: 200,
            data: [{ message: 'The runner has received a shutdown signal' }],
          };
        return { ok: true, status: 200, data: {} };
      },
    }
  );
  assert.equal(retried.retried, true);
  assert.equal(retried.reason, 'infra-retry-requested');
  assert.deepEqual(posts, [
    '/repos/JovieInc/Jovie/actions/runs/44554154244/rerun-failed-jobs',
  ]);
});

test('maybe-retry is fail-closed when the HA entrypoint or rate limit blocks it', async () => {
  const { eventPath, outDir, dir } = writeEvent(eventPayload());
  const missing = await maybeRetry(
    {
      eventPath,
      repository: 'JovieInc/Jovie',
      readToken: 'read',
      writeToken: 'write',
      outDir,
      root: dir,
    },
    {
      exists: () => false,
      request: async () => {
        throw new Error('should not call the API');
      },
    }
  );
  assert.equal(missing.reason, 'collector-entrypoint-missing');

  const limited = await maybeRetry(
    {
      eventPath,
      repository: 'JovieInc/Jovie',
      readToken: 'read',
      writeToken: 'write',
      outDir,
      ledgerPath: join(dir, 'ledger.json'),
      root: dir,
    },
    {
      exists: path => path.endsWith('scripts/lib/flake-ledger.mjs'),
      importCollector: async () => ({
        classifyRerunEligibility: () => ({
          retryable: true,
          kind: 'transient-infrastructure',
        }),
        canRetry: () => ({ allowed: false }),
        recordRetry: () => {
          throw new Error('should not record');
        },
      }),
      request: async (path, opts) => {
        if (opts?.method === 'POST') throw new Error('should not POST');
        return {
          ok: true,
          status: 200,
          data: {
            jobs: [
              { id: 3, name: 'Checkout', conclusion: 'failure', steps: [] },
            ],
          },
        };
      },
    }
  );
  assert.equal(limited.reason, 'retry-rate-limited');
});
