import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  apiRetryDelay,
  githubRequest,
  MAX_API_ATTEMPTS,
  MergeGroupPolicyRateLimitError,
} from './merge-group-member-policy.mjs';

function runPolicyCli({ status = 200, oversized = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'size-guard-cli-'));
  try {
    const preload = join(dir, 'preload.mjs');
    const calls = join(dir, 'calls');
    // Exercise the historical CLI entrypoint with a fake transport and clock.
    // Subprocesses cannot accidentally consume GitHub quota in these tests.
    writeFileSync(
      preload,
      `
      import { appendFileSync } from 'node:fs';
      let clock = 1000;
      Date.now = () => clock;
      Math.random = () => 0.5;
      globalThis.setTimeout = (callback, ms) => { clock += ms; queueMicrotask(callback); };
      globalThis.fetch = async url => {
        appendFileSync(process.env.CALL_LOG, url + '\\n');
        if (process.env.RESPONSE_STATUS !== '200') return new Response(JSON.stringify({ message: process.env.RESPONSE_STATUS === '403' ? 'Resource not accessible by integration' : 'limited' }), { status: Number(process.env.RESPONSE_STATUS) });
        const path = new URL(url).pathname;
        if (path.endsWith('/files')) return new Response(JSON.stringify([{ filename: 'apps/web/a.ts' }]));
        const number = Number(path.split('/').at(-1));
        return new Response(JSON.stringify({ head: { sha: String(number).repeat(40), repo: { full_name: 'JovieInc/Jovie' } } }));
      };
    `
    );
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        preload,
        new URL('./pr-size-guard-policy.mjs', import.meta.url).pathname,
      ],
      {
        encoding: 'utf8',
        timeout: 5_000,
        env: {
          ...process.env,
          GH_TOKEN: 'test-token',
          GITHUB_STEP_SUMMARY: '',
          PR_LABELS: 'integration-train',
          PR_BODY: `<!-- integration-train-sources\n- https://github.com/JovieInc/Jovie/pull/1 @ ${'1'.repeat(40)}\n- https://github.com/JovieInc/Jovie/pull/2 @ ${'2'.repeat(40)}\n-->`,
          PR: '999',
          REPO: 'JovieInc/Jovie',
          PR_LINES: oversized ? '3000' : '1500',
          PR_FILES: '10',
          MAX_LINES: '800',
          MAX_FILES: '40',
          RESPONSE_STATUS: String(status),
          CALL_LOG: calls,
        },
      }
    );
    let requests = [];
    try {
      requests = readFileSync(calls, 'utf8').trim().split('\n');
    } catch {
      /* no API reads on a policy failure */
    }
    return { ...result, requests };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('source Size Guard uses the bounded reader and succeeds only with source-coverage evidence', () => {
  const result = runPolicyCli();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /source coverage verified/);
  assert.equal(result.requests.length, 5);
});

test('source Size Guard exhaustion exits nonzero with infra failure; permissions fail without retry', () => {
  const throttled = runPolicyCli({ status: 429 });
  assert.equal(throttled.status, 1, throttled.stderr);
  assert.equal(throttled.requests.length, MAX_API_ATTEMPTS);
  assert.match(throttled.stderr, /infra-failure.*budget-unavailable/);
  const forbidden = runPolicyCli({ status: 403 });
  assert.equal(forbidden.status, 1);
  assert.equal(forbidden.requests.length, 1);
});

test('real source size violations never reach the API retry path', () => {
  const result = runPolicyCli({ oversized: true });
  assert.equal(result.status, 1);
  assert.deepEqual(result.requests, []);
  assert.match(result.stdout, /exceeds bounded integration-train size cap/);
});

async function exercise(answers, overrides = {}) {
  let clock = 1_000;
  let calls = 0;
  const sleeps = [];
  let result;
  let error;
  try {
    result = await githubRequest('/repos/JovieInc/Jovie/pulls/1', {
      token: 'test-token',
      deadlineMs: 100_000,
      now: () => clock,
      random: () => 0.5,
      sleep: async ms => {
        sleeps.push(ms);
        clock += ms;
      },
      fetchImpl: async () => {
        const answer = answers[Math.min(calls++, answers.length - 1)];
        return new Response(
          JSON.stringify(
            answer.body ?? { message: answer.message ?? 'limited' }
          ),
          { status: answer.status, headers: answer.headers }
        );
      },
      ...overrides,
    });
  } catch (caught) {
    error = caught;
  }
  return { calls, sleeps, result, error };
}
test('403 quota failures retry with exponential backoff and success returns the policy evidence', async () => {
  const answer = await exercise([
    { status: 403, message: 'API rate limit exceeded for installation' },
    { status: 403, message: 'You have exceeded a secondary rate limit' },
    { status: 200, body: { ok: true } },
  ]);
  assert.equal(answer.calls, 3);
  assert.deepEqual(answer.sleeps, [1_000, 2_000]);
  assert.deepEqual(answer.result.data, { ok: true });
});
test('403 permissions failures fail immediately without retry or a green verdict', async () => {
  const answer = await exercise([
    { status: 403, message: 'Resource not accessible by integration' },
  ]);
  assert.equal(answer.calls, 1);
  assert.deepEqual(answer.sleeps, []);
  assert.match(answer.error.message, /Resource not accessible/);
  assert.equal(answer.result, undefined);
});
test('429 honors Retry-After and primary 403 honors reset, using the later bound', async () => {
  const answer = await exercise([
    { status: 429, headers: { 'retry-after': '3' } },
    {
      status: 403,
      headers: {
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '12',
        'retry-after': '2',
      },
    },
    { status: 200, body: [] },
  ]);
  assert.deepEqual(answer.sleeps, [4_000, 8_000]);
  assert.deepEqual(answer.result.data, []);
});
test('repeated throttles exhaust bounded attempts and fail closed as infrastructure', async () => {
  const answer = await exercise([{ status: 429 }]);
  assert.equal(answer.calls, MAX_API_ATTEMPTS);
  assert.deepEqual(answer.sleeps, [1_000, 2_000, 4_000, 8_000, 15_000]);
  assert.ok(answer.error instanceof MergeGroupPolicyRateLimitError);
  assert.match(
    answer.error.message,
    /infra-failure.*budget-unavailable.*exhausted/
  );
  assert.equal(answer.result, undefined);
});
test('a reset beyond the total budget fails closed without sleeping past the deadline', async () => {
  const answer = await exercise([
    {
      status: 403,
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '3600' },
    },
  ]);
  assert.equal(answer.calls, 1);
  assert.deepEqual(answer.sleeps, []);
  assert.match(answer.error.message, /infra-failure/);
});
test('successful reads pass on the first attempt and real policy/API failures stay final', async () => {
  const success = await exercise([{ status: 200, body: { additions: 50 } }]);
  assert.equal(success.calls, 1);
  assert.deepEqual(success.sleeps, []);
  assert.deepEqual(success.result.data, { additions: 50 });
  const policy = await exercise([{ status: 422, message: 'Policy violation' }]);
  assert.equal(policy.calls, 1);
  assert.match(policy.error.message, /Policy violation/);
});
test('Retry-After HTTP dates are honored and repeated short hints cannot defeat backoff', () => {
  const options = { status: 429, nowMs: 0, deadlineMs: 60_000, attempt: 4 };
  assert.equal(
    apiRetryDelay({ ...options, headers: new Headers({ 'retry-after': '0' }) }),
    8_000
  );
  assert.equal(
    apiRetryDelay({
      ...options,
      headers: new Headers({ 'retry-after': 'Thu, 01 Jan 1970 00:00:10 GMT' }),
    }),
    11_000
  );
});
