import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createGitHubClient } from '../packages/api-client/github.ts';
import { MemoryLedgerStore } from '../packages/api-client/store.ts';
import {
  evaluateBudget,
  LOW_BUDGET_FRACTION,
  main,
  render,
} from './installation-budget-sentinel.mjs';

const NOW = 1_800_000_000_000;
const core = (remaining, limit = 1000) => ({
  limit,
  remaining,
  reset: NOW / 1000 + 600,
});

test('alarms strictly below 15% remaining', () => {
  assert.equal(LOW_BUDGET_FRACTION, 0.15);
  assert.equal(evaluateBudget(core(149), NOW).low, true);
  assert.equal(evaluateBudget(core(150), NOW).low, false);
  const sample = evaluateBudget(core(0), NOW);
  assert.equal(sample.used, 1000);
  assert.equal(sample.resetInSeconds, 600);
});

test('rejects malformed rate_limit data instead of reporting a healthy budget', () => {
  for (const bad of [
    undefined,
    {},
    { limit: 0, remaining: 0, reset: 1 },
    { limit: 5, remaining: -1, reset: 1 },
  ])
    assert.throws(() => evaluateBudget(bad, NOW), /malformed/);
});

test('render names the installation and errors below the floor', () => {
  assert.match(
    render(evaluateBudget(core(100), NOW), 'ci-app'),
    /^::error title=GitHub ci-app budget low::ci-app REST budget 100\/1000/
  );
  assert.match(
    render(evaluateBudget(core(900), NOW)),
    /^::notice title=GitHub installation budget::/
  );
});

test('main samples the shared and CI App installations separately and never logs a token', async () => {
  const logs = [];
  const seen = [];
  const samples = await main({
    store: new MemoryLedgerStore(),
    env: { GITHUB_TOKEN: 'tok-shared', CI_APP_TOKEN: 'tok-app' },
    fetchImpl: async (url, options) => {
      assert.equal(String(url), 'https://api.github.com/rate_limit');
      const token = new Headers(options.headers)
        .get('authorization')
        .replace('Bearer ', '');
      seen.push(token);
      return Response.json({
        resources: { core: token === 'tok-shared' ? core(50) : core(900) },
      });
    },
    log: x => logs.push(x),
    now: () => NOW,
  });
  assert.deepEqual(seen, ['tok-shared', 'tok-app']);
  assert.equal(samples['shared-github-token'].low, true);
  assert.equal(samples['ci-app'].low, false);
  assert.match(logs[0], /^::error title=GitHub shared-github-token budget low/);
  assert.match(logs[1], /^::notice title=GitHub ci-app budget/);
  assert.doesNotMatch(logs.join('\n'), /tok-/);
});

test('a missing token or failed read warns instead of alarming or throwing', async () => {
  const logs = [];
  await main({
    store: new MemoryLedgerStore(),
    env: { GITHUB_TOKEN: 'tok-shared' },
    fetchImpl: async () => new Response(null, { status: 500 }),
    log: x => logs.push(x),
  });
  assert.match(
    logs[0],
    /^::warning::shared-github-token budget sample unavailable \(.*500\)/
  );
  assert.match(logs[1], /^::warning::ci-app budget not sampled/);
});

test('samples a depleted shared ledger without a charged or cached REST read', async () => {
  const store = new MemoryLedgerStore();
  const seen = [];
  const fetchImpl = async (url, options) => {
    seen.push({ url, headers: options.headers });
    return Response.json(
      { resources: { core: core(0) } },
      {
        headers: {
          'x-ratelimit-limit': '1000',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(NOW / 1000 + 600),
          etag: '"sample"',
        },
      }
    );
  };
  const github = createGitHubClient({
    token: 'tok-shared',
    store,
    fetch: fetchImpl,
    now: () => NOW,
  });
  await github.rest('GET', '/repos/JovieInc/Jovie');
  assert.equal(
    Object.values((await store.read('github')).credentials)[0].buckets.core
      .remaining,
    0
  );
  for (let i = 0; i < 2; i++) {
    const samples = await main({
      env: { GITHUB_TOKEN: 'tok-shared' },
      store,
      fetchImpl,
      now: () => NOW,
      log: () => {},
    });
    assert.equal(samples['shared-github-token'].low, true);
  }
  assert.equal(seen.length, 3);
  for (const request of seen.slice(1)) {
    assert.equal(String(request.url), 'https://api.github.com/rate_limit');
    assert.equal(request.headers.has('if-none-match'), false);
  }
});

test('writes per-installation alarm outputs and summary for Slack', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'installation-budget-'));
  const output = join(dir, 'output');
  const summary = join(dir, 'summary');
  try {
    await main({
      env: {
        GITHUB_TOKEN: 'tok-shared',
        CI_APP_TOKEN: 'tok-app',
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
      },
      store: new MemoryLedgerStore(),
      now: () => NOW,
      log: () => {},
      fetchImpl: async (_, options) =>
        Response.json({
          resources: {
            core: core(
              new Headers(options.headers).get('authorization') ===
                'Bearer tok-shared'
                ? 50
                : 900
            ),
          },
        }),
    });
    assert.equal(
      readFileSync(output, 'utf8'),
      'shared_github_token_low=true\nshared_github_token_remaining=50\nshared_github_token_limit=1000\nshared_github_token_reset_in_seconds=600\n' +
        'ci_app_low=false\nci_app_remaining=900\nci_app_limit=1000\nci_app_reset_in_seconds=600\n'
    );
    assert.match(
      readFileSync(summary, 'utf8'),
      /shared-github-token budget: remaining=50/
    );
    assert.match(readFileSync(summary, 'utf8'), /ci-app budget: remaining=900/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('one failed installation does not hide the other or expose credentials', async () => {
  const logs = [];
  let calls = 0;
  const samples = await main({
    env: { GITHUB_TOKEN: 'tok-shared', CI_APP_TOKEN: 'tok-app' },
    store: new MemoryLedgerStore(),
    now: () => NOW,
    log: x => logs.push(x),
    fetchImpl: async (_, options) => {
      calls++;
      if (
        new Headers(options.headers).get('authorization') ===
        'Bearer tok-shared'
      )
        throw new Error('network failure with tok-shared');
      return Response.json({ resources: { core: core(50) } });
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(Object.keys(samples), ['ci-app']);
  assert.equal(samples['ci-app'].low, true);
  assert.match(logs[0], /budget sample unavailable/);
  assert.doesNotMatch(logs.join('\n'), /tok-shared|tok-app/);
});

test('malformed and non-successful samples warn without raising an alarm', async () => {
  for (const response of [
    Response.json({}),
    new Response('{}', { status: 404 }),
    new Response('{'),
  ]) {
    const logs = [];
    const samples = await main({
      env: { GITHUB_TOKEN: 'tok-shared' },
      store: new MemoryLedgerStore(),
      fetchImpl: async () => response,
      now: () => NOW,
      log: x => logs.push(x),
    });
    assert.deepEqual(samples, {});
    assert.match(logs[0], /budget sample unavailable/);
    assert.doesNotMatch(logs.join('\n'), /::error/);
  }
});

test('uses authoritative core headers when the overview body disagrees', async () => {
  for (const resource of ['core', 'search']) {
    const samples = await main({
      env: { GITHUB_TOKEN: 'tok-shared' },
      store: new MemoryLedgerStore(),
      now: () => NOW,
      log: () => {},
      fetchImpl: async () =>
        Response.json(
          { resources: { core: core(900) } },
          {
            headers: {
              'x-ratelimit-resource': resource,
              'x-ratelimit-limit': '1000',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(NOW / 1000 + 600),
            },
          }
        ),
    });
    assert.equal(
      samples['shared-github-token'].remaining,
      resource === 'core' ? 0 : 900
    );
    assert.equal(samples['shared-github-token'].low, resource === 'core');
  }
});
