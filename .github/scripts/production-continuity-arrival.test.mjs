import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { observeProductionFreshness } from './production-continuity.mjs';

const NOW = '2026-11-20T14:30:00Z';
const LIVE = 'a'.repeat(40);
const OLDEST = 'b'.repeat(40);
const MAIN = 'c'.repeat(40);
const CREATED = '2026-11-20T07:00:00Z';
const ARRIVED = '2026-11-20T14:09:00Z';
const run = (head_sha = MAIN, created_at = ARRIVED, extra = {}) => ({
  head_sha,
  created_at,
  event: 'push',
  head_branch: 'main',
  ...extra,
});

function fixture({
  commits = [{ sha: MAIN, commit: { committer: { date: CREATED } } }],
  ahead = commits?.length,
  ledger = { total_count: 1, workflow_runs: [run()] },
  status = 200,
  clientError = null,
  compareExtra = {},
} = {}) {
  const fetchCalls = [],
    requests = [];
  return {
    fetchCalls,
    requests,
    options: {
      now: NOW,
      repository: 'fixture/repo',
      token: 'ghs_fixture',
      buildInfoUrl: 'https://production-fixture.invalid/build-info',
      githubApiUrl: 'https://github-fixture.invalid',
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url, init });
        const body = url.endsWith('/build-info')
          ? { commitSha: LIVE }
          : url.endsWith('/commits/main')
            ? { sha: MAIN }
            : url.includes('/compare/')
              ? { ahead_by: ahead, commits, ...compareExtra }
              : null;
        assert.ok(body, `unexpected unbudgeted read: ${url}`);
        return { status: 200, json: async () => body };
      },
      githubClient: {
        request: async options => {
          requests.push(options);
          if (clientError) throw clientError;
          return { status, json: () => ledger };
        },
      },
    },
  };
}

describe('production continuity main-arrival evidence', () => {
  it('does not count queue residence against the measured production bound', async () => {
    const f = fixture();
    const result = await observeProductionFreshness(f.options);
    assert.equal(result.healthy, true);
    assert.equal(result.catchingUp, true);
    assert.equal(result.unshippedAgeSeconds, 21 * 60);
    assert.equal(result.unshippedArrivedAt, new Date(ARRIVED).toISOString());
    assert.equal(result.oldestUnshippedAt, CREATED);
    assert.equal(result.incidentClass, null);
  });

  it('still reports a real stall after the existing measured bound', async () => {
    const f = fixture({
      ledger: {
        total_count: 1,
        workflow_runs: [run(MAIN, '2026-11-20T09:00:00Z')],
      },
    });
    const result = await observeProductionFreshness(f.options);
    assert.equal(result.healthy, false);
    assert.equal(result.incidentClass, 'production-stale');
    assert.equal(result.unshippedAgeSeconds, 330 * 60);
    assert.equal(result.catchingUp, false);
  });

  it('uses the main push tip to observe a complete batch range', async () => {
    const f = fixture({
      commits: [OLDEST, MAIN].map(sha => ({
        sha,
        commit: { committer: { date: CREATED } },
      })),
    });
    const result = await observeProductionFreshness(f.options);
    assert.equal(result.healthy, true);
    assert.equal(result.unshippedCommits, 2);
    assert.equal(result.unshippedAgeSeconds, 1260);
  });

  it('keeps missing, malformed, failed and future landing evidence unknown', async () => {
    const cases = [
      { status: 503 },
      { clientError: new Error('quota-deferred') },
      { ledger: null },
      { ledger: { total_count: 0, workflow_runs: [] } },
      { ledger: { workflow_runs: [run()] } },
      { ledger: { total_count: '1', workflow_runs: [run()] } },
      { ledger: { total_count: 0, workflow_runs: [run()] } },
      { ledger: { total_count: 1, workflow_runs: [run(MAIN, 'bad')] } },
      {
        ledger: {
          total_count: 1,
          workflow_runs: [run(MAIN, '2026-11-20T15:00:00Z')],
        },
      },
      {
        ledger: {
          total_count: 1,
          workflow_runs: [run(MAIN, ARRIVED, { event: 'pull_request' })],
        },
      },
      {
        ledger: {
          total_count: 1,
          workflow_runs: [run(MAIN, ARRIVED, { head_branch: 'feature' })],
        },
      },
      { ledger: { total_count: 1, workflow_runs: [run('not-a-sha')] } },
    ];
    for (const input of cases) {
      const result = await observeProductionFreshness(fixture(input).options);
      assert.equal(result.healthy, null, JSON.stringify(input));
      assert.equal(result.incidentClass, null);
      assert.equal(result.reason, 'unshipped-arrival-unreadable');
    }
  });

  it('does not infer staleness from an old unrelated ledger page', async () => {
    const f = fixture({
      ledger: { total_count: 1, workflow_runs: [run('d'.repeat(40), CREATED)] },
    });
    const result = await observeProductionFreshness(f.options);
    assert.equal(result.healthy, null);
    assert.equal(result.incidentClass, null);
  });

  it('does not certify a partial commit range or a partial landing window', async () => {
    for (const input of [
      { ahead: 2 },
      { commits: null, ahead: 1 },
      { commits: [{ sha: OLDEST }], ahead: 1 },
      { commits: [MAIN, MAIN].map(sha => ({ sha })) },
      { commits: [LIVE, MAIN].map(sha => ({ sha })) },
    ]) {
      const partial = await observeProductionFreshness(fixture(input).options);
      assert.equal(partial.healthy, null);
      assert.equal(partial.reason, 'unshipped-range-unreadable');
    }
    const runs = [
      run(),
      ...Array.from({ length: 99 }, (_, n) =>
        run((n + 1).toString(16).padStart(40, '0'))
      ),
    ];
    const f = fixture({
      commits: [OLDEST, MAIN].map(sha => ({
        sha,
        commit: { committer: { date: CREATED } },
      })),
      ledger: { total_count: 101, workflow_runs: runs },
    });
    assert.equal((await observeProductionFreshness(f.options)).healthy, null);
  });

  it('uses one bounded shared-client poll read without changing credentials', async () => {
    const f = fixture();
    await observeProductionFreshness({ ...f.options, timeoutMs: 1523 });
    assert.equal(f.requests.length, 1);
    const request = f.requests[0];
    assert.equal(request.priority, 'poll');
    assert.equal(request.maxAttempts, 1);
    assert.equal(request.maxWaitMs, 0);
    assert.equal(request.timeoutMs, 1523);
    assert.equal(request.headers.Authorization, 'Bearer ghs_fixture');
    const url = new URL(request.url);
    assert.equal(
      url.pathname,
      '/repos/fixture/repo/actions/workflows/ci.yml/runs'
    );
    assert.equal(url.searchParams.get('branch'), 'main');
    assert.equal(url.searchParams.get('event'), 'push');
    assert.equal(url.searchParams.get('per_page'), '100');
    assert.equal(f.fetchCalls[0].init.headers.Authorization, undefined);
  });
});

it('uses the real shared client and an isolated ledger in the standalone workflow runtime', () => {
  const state = mkdtempSync(join(tmpdir(), 'freshness-client-'));
  const source = new URL('./production-continuity-arrival.mjs', import.meta.url)
    .href;
  const code = `
    import { readMainArrival } from ${JSON.stringify(source)};
    const now = '2026-11-20T14:30:00Z';
    Date.now = () => Date.parse(now);
    const calls = [];
    const main = 'b'.repeat(40);
    const result = await readMainArrival({
      compare: { ahead_by: 1, commits: [{ sha: main, commit: { committer: { date: '2026-11-20T07:00:00Z' } } }] },
      liveSha: 'a'.repeat(40), mainSha: main, repository: 'fixture/repo',
      token: 'ghs_fixture', githubApiUrl: 'https://github-fixture.invalid', now, timeoutMs: 1523,
      fetchImpl: async (url, init) => {
        calls.push({ url, authorization: new Headers(init.headers).get('Authorization') });
        return new Response(JSON.stringify({ total_count: 1, workflow_runs: [{
          head_sha: main, event: 'push', head_branch: 'main', created_at: '2026-11-20T14:09:00Z'
        }] }), { headers: { 'content-type': 'application/json' } });
      },
    });
    console.log(JSON.stringify({ result, calls }));
  `;
  try {
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', code],
      {
        encoding: 'utf8',
        env: { ...process.env, JOVIE_API_STATE_DIR: state },
        timeout: 10000,
      }
    );
    assert.equal(child.status, 0, child.stderr);
    const observed = JSON.parse(child.stdout);
    assert.equal(observed.result.ok, true);
    assert.equal(observed.result.unshippedAgeSeconds, 1260);
    assert.equal(observed.calls.length, 1);
    assert.equal(observed.calls[0].authorization, 'Bearer ghs_fixture');
    assert.equal(existsSync(join(state, 'api-ledger', 'github.json')), true);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

it('bounds a partial ledger with the known live ancestor when a batch has no oldest-head run', async () => {
  const runs = [
    run(),
    run(LIVE, '2026-11-20T12:00:00Z'),
    ...Array.from({ length: 98 }, (_, n) =>
      run((n + 1).toString(16).padStart(40, '0'), CREATED)
    ),
  ];
  const f = fixture({
    commits: [OLDEST, MAIN].map(sha => ({
      sha,
      commit: { committer: { date: CREATED } },
    })),
    ledger: { total_count: 101, workflow_runs: runs },
  });
  const result = await observeProductionFreshness(f.options);
  assert.equal(result.healthy, true);
  assert.equal(result.unshippedAgeSeconds, 1260);
  assert.equal(f.requests.length, 1);
});

describe('verified stale lower bounds with incomplete inventories', () => {
  const truncated = overrides =>
    fixture({
      commits: Array.from({ length: 250 }, (_, n) => ({
        sha: (n + 1).toString(16).padStart(40, '0'),
        commit: { committer: { date: CREATED } },
      })),
      ahead: 251,
      compareExtra: {
        status: 'ahead',
        total_commits: 251,
        merge_base_commit: { sha: LIVE },
      },
      ...overrides,
    });

  it('reports a verified old unshipped main even when compare omits its SHA', async () => {
    const f = truncated({
      ledger: {
        total_count: 1,
        workflow_runs: [run(MAIN, '2026-11-20T09:00:00Z')],
      },
    });
    const result = await observeProductionFreshness(f.options);
    assert.equal(result.healthy, false);
    assert.equal(result.incidentClass, 'production-stale');
    assert.equal(result.unshippedAgeSeconds, 330 * 60);
    assert.equal(result.unshippedAgeIsLowerBound, true);
    assert.equal(result.reason, 'unshipped-for-at-least-19800s');
    assert.equal(f.requests.length, 1);
  });

  it('does not certify freshness from a truncated range with a recent main arrival', async () => {
    const f = truncated();
    const result = await observeProductionFreshness(f.options);
    assert.equal(result.healthy, null);
    assert.equal(result.incidentClass, null);
    assert.equal(result.reason, 'unshipped-arrival-unreadable');
    assert.equal(f.requests.length, 1);
  });

  it('requires exact ahead and merge-base evidence before trusting an omitted main SHA', async () => {
    for (const extra of [
      { status: 'diverged' },
      { total_commits: 250 },
      { merge_base_commit: { sha: OLDEST } },
    ]) {
      const f = truncated({
        compareExtra: {
          status: 'ahead',
          total_commits: 251,
          merge_base_commit: { sha: LIVE },
          ...extra,
        },
      });
      const result = await observeProductionFreshness(f.options);
      assert.equal(result.healthy, null);
      assert.equal(f.requests.length, 0);
    }
  });

  it('preserves the caller bound when a partial range proves less than that bound', async () => {
    const f = truncated({
      ledger: {
        total_count: 1,
        workflow_runs: [run(MAIN, '2026-11-20T09:00:00Z')],
      },
    });
    for (const staleAfterSeconds of [360 * 60, 0, -1, NaN, Infinity]) {
      const result = await observeProductionFreshness({
        ...f.options,
        staleAfterSeconds,
      });
      assert.equal(result.healthy, null);
      assert.equal(result.incidentClass, null);
    }
    assert.equal(f.requests.length, 5);
  });

  it('uses a verified old unshipped head as a lower bound even if the ledger window is partial', async () => {
    const f = fixture({
      commits: [OLDEST, MAIN].map(sha => ({
        sha,
        commit: { committer: { date: CREATED } },
      })),
      ledger: {
        total_count: 101,
        workflow_runs: [
          run(MAIN, '2026-11-20T09:00:00Z'),
          ...Array.from({ length: 99 }, (_, n) =>
            run((n + 1).toString(16).padStart(40, '0'))
          ),
        ],
      },
    });
    const result = await observeProductionFreshness(f.options);
    assert.equal(result.healthy, false);
    assert.equal(result.unshippedAgeIsLowerBound, true);
    assert.equal(result.unshippedAgeSeconds, 330 * 60);
    assert.equal(f.requests.length, 1);
  });
});
