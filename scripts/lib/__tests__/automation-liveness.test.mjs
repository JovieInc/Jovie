import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../packages/api-client/client.ts';
import { MemoryLedgerStore } from '../../../packages/api-client/store.ts';
import { runLiveness as runLivenessImpl } from '../../automation-liveness.mjs';
import {
  livenessDecisions,
  livenessFingerprint,
  loadRegistry,
} from '../automation-registry.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const registry = loadRegistry(repoRoot);
const NOW = Date.parse('2026-10-20T19:35:00Z');
const iso = minutesAgo => new Date(NOW - minutesAgo * 60_000).toISOString();
const MAIN = 'a'.repeat(40);
const LIVE = 'b'.repeat(40);

function runLiveness(options) {
  return runLivenessImpl({
    ...options,
    githubClient: createApiClient({
      provider: 'github',
      credential: 'test',
      fetch: options.fetchImpl,
      store: new MemoryLedgerStore(),
      now: () => NOW,
      sleep: async () => {},
      random: () => 0,
    }),
  });
}

function mainRef(sha) {
  return { ref: 'refs/heads/main', object: { type: 'commit', sha } };
}

function only(...ids) {
  const entries = registry.entries.filter(entry => ids.includes(entry.id));
  expect(entries.map(entry => entry.id).sort()).toEqual([...ids].sort());
  return { ...registry, entries };
}

/** Fake network: URL substring -> JSON body (or a status number). */
function fakeFetch(routes) {
  return async input => {
    const url = String(input);
    const hit = Object.entries(routes).find(([key]) => url.includes(key));
    if (!hit) return new Response('{}', { status: 404 });
    const value = typeof hit[1] === 'function' ? hit[1](url) : hit[1];
    if (value instanceof Response) return value;
    if (typeof value === 'number') return new Response('{}', { status: value });
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

function runs(...rows) {
  return {
    workflow_runs: rows.map(
      ([minutesAgo, conclusion, id, event = 'repository_dispatch']) => ({
        id,
        conclusion,
        event,
        run_started_at: iso(minutesAgo + 1),
        created_at: iso(minutesAgo + 1),
        updated_at: iso(minutesAgo),
        html_url: `https://github.com/JovieInc/Jovie/actions/runs/${id}`,
      })
    ),
  };
}

function rowFor(report, id) {
  return report.results.find(row => row.id === id);
}

describe('dead-man liveness', () => {
  // (a) 2026-10-20: the Production Continuity Guard kept reading green while
  // production lagged main by ~5h. The promotion heartbeat is judged on its
  // own, so a green guard cannot mask a silent release pipeline.
  it('(a) a green continuity guard does not hide a production promotion that went silent', async () => {
    const { report } = await runLiveness({
      registry: only(
        'github:jovie:production-continuity',
        'derived:jovie:production-promotion'
      ),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'production-continuity.yml/runs': runs(
          [2, 'success', 3],
          [7, 'success', 2],
          [12, 'success', 1]
        ),
        'jov.ie/api/health/build-info': { commitSha: LIVE },
        '/git/ref/heads/main': mainRef(MAIN),
        [`/compare/${LIVE}...${MAIN}`]: {
          ahead_by: 9,
          commits: [{ commit: { committer: { date: iso(5 * 60) } } }],
        },
      }),
    });
    expect(rowFor(report, 'github:jovie:production-continuity').status).toBe(
      'fresh'
    );
    const promotion = rowFor(report, 'derived:jovie:production-promotion');
    expect(promotion.status).toBe('stale');
    expect(promotion.ageMinutes).toBe(300);
    expect(report.status).toBe('critical');
    const decisions = livenessDecisions(report);
    expect(decisions).toEqual([
      expect.objectContaining({
        action: 'red',
        fingerprint: livenessFingerprint('derived:jovie:production-promotion'),
      }),
    ]);
  });

  it('(a) an unreadable production build is silence, not health (the guard fails open)', async () => {
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: fakeFetch({ 'jov.ie/api/health/build-info': 503 }),
    });
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'unknown',
      reason: 'live-sha-unreadable',
    });
    expect(livenessDecisions(report)[0].action).toBe('red');
  });

  it('reads fresh authenticated main identity without the full commit and its diff', async () => {
    let mainHeaders = new Headers();
    const network = fakeFetch({
      'jov.ie/api/health/build-info': { commitSha: MAIN },
      '/git/ref/heads/main': mainRef(MAIN),
      '/commits/main': 503,
    });
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      token: 'test-token',
      fetchImpl: async (url, init) => {
        if (String(url).includes('/git/ref/heads/main'))
          mainHeaders = new Headers(init.headers);
        return network(url);
      },
    });
    expect(mainHeaders.get('authorization')).toBe('Bearer test-token');
    expect(mainHeaders.get('cache-control')).toBe('no-cache');
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'fresh',
      reason: 'production-current',
      lastProofAt: iso(0),
    });
    expect(livenessDecisions(report)).toEqual([]);
  });

  it('keeps a recent unshipped commit inside the promotion silence budget', async () => {
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'jov.ie/api/health/build-info': { commitSha: LIVE },
        '/git/ref/heads/main': mainRef(MAIN),
        [`/compare/${LIVE}...${MAIN}`]: {
          ahead_by: 1,
          commits: [{ commit: { committer: { date: iso(30) } } }],
        },
      }),
    });
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'fresh',
      reason: '1-commits-unshipped',
      ageMinutes: 30,
    });
    expect(livenessDecisions(report)).toEqual([]);
  });

  // JOV-8766: #22518's squash committer date was 15:52Z and the fast-forward
  // onto main was 17:58Z. Production promoted 19 minutes later. Aging from
  // the queue timestamp reported 141 minutes and paged a healthy release.
  it('ages a merge-queue commit from when its push reached main', async () => {
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'jov.ie/api/health/build-info': { commitSha: LIVE },
        '/git/ref/heads/main': mainRef(MAIN),
        [`/compare/${LIVE}...${MAIN}`]: {
          ahead_by: 1,
          commits: [
            {
              sha: MAIN,
              commit: { committer: { date: iso(141) } },
            },
          ],
        },
        'event=push': {
          total_count: 1,
          workflow_runs: [{ created_at: iso(19), event: 'push' }],
        },
      }),
    });
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'fresh',
      reason: '1-commits-unshipped',
      ageMinutes: 19,
      lastProofAt: iso(19),
    });
    expect(livenessDecisions(report)).toEqual([]);
  });

  it('stays stale when the commit has been on main past the silence budget', async () => {
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'jov.ie/api/health/build-info': { commitSha: LIVE },
        '/git/ref/heads/main': mainRef(MAIN),
        [`/compare/${LIVE}...${MAIN}`]: {
          ahead_by: 1,
          commits: [
            {
              sha: MAIN,
              commit: { committer: { date: iso(141) } },
            },
          ],
        },
        'event=push': {
          total_count: 1,
          workflow_runs: [{ created_at: iso(141), event: 'push' }],
        },
      }),
    });
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'stale',
      ageMinutes: 141,
    });
  });

  it('ignores a push run from before the commit and a failed landing read', async () => {
    const routes = landing =>
      fakeFetch({
        'jov.ie/api/health/build-info': { commitSha: LIVE },
        '/git/ref/heads/main': mainRef(MAIN),
        [`/compare/${LIVE}...${MAIN}`]: {
          ahead_by: 1,
          commits: [
            {
              sha: MAIN,
              commit: { committer: { date: iso(30) } },
            },
          ],
        },
        'event=push': landing,
      });
    const early = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: routes({
        total_count: 1,
        workflow_runs: [{ created_at: iso(400), event: 'push' }],
      }),
    });
    expect(
      rowFor(early.report, 'derived:jovie:production-promotion')
    ).toMatchObject({
      status: 'fresh',
      ageMinutes: 30,
    });
    const unread = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: routes(503),
    });
    expect(
      rowFor(unread.report, 'derived:jovie:production-promotion')
    ).toMatchObject({
      status: 'fresh',
      ageMinutes: 30,
    });
  });

  it('uses the oldest page when push runs spill past one page', async () => {
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'jov.ie/api/health/build-info': { commitSha: LIVE },
        '/git/ref/heads/main': mainRef(MAIN),
        [`/compare/${LIVE}...${MAIN}`]: {
          ahead_by: 2,
          commits: [
            {
              sha: MAIN,
              commit: { committer: { date: iso(180) } },
            },
          ],
        },
        'event=push': url =>
          String(url).includes('page=2')
            ? {
                total_count: 101,
                workflow_runs: [{ created_at: iso(130), event: 'push' }],
              }
            : {
                total_count: 101,
                workflow_runs: [{ created_at: iso(5), event: 'push' }],
              },
      }),
    });
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'stale',
      ageMinutes: 130,
    });
  });

  it.each([
    [503, 'unknown', 'unshipped-range-unreadable'],
    [{ ahead_by: 1, commits: [] }, 'unknown', 'unshipped-age-unreadable'],
    [{ ahead_by: 0 }, 'fresh', 'production-current'],
  ])(
    'judges the unshipped range independently (%j)',
    async (range, status, reason) => {
      const { report } = await runLiveness({
        registry: only('derived:jovie:production-promotion'),
        nowMs: NOW,
        fetchImpl: fakeFetch({
          'jov.ie/api/health/build-info': { commitSha: LIVE },
          '/git/ref/heads/main': mainRef(MAIN),
          [`/compare/${LIVE}...${MAIN}`]: range,
        }),
      });
      expect(
        rowFor(report, 'derived:jovie:production-promotion')
      ).toMatchObject({
        status,
        reason,
      });
      expect(livenessDecisions(report).length).toBe(status === 'fresh' ? 0 : 1);
    }
  );

  it.each([500, 502, 503, 504, { name: 'AbortError' }, new Error('reset')])(
    'recovers a transient main-ref read with one bounded retry (%j)',
    async failure => {
      let attempts = 0;
      const { report } = await runLiveness({
        registry: only('derived:jovie:production-promotion'),
        nowMs: NOW,
        fetchImpl: fakeFetch({
          'jov.ie/api/health/build-info': { commitSha: MAIN },
          '/git/ref/heads/main': () => {
            attempts += 1;
            if (attempts > 1) return mainRef(MAIN);
            if (typeof failure === 'number') return failure;
            throw failure;
          },
        }),
      });
      expect(
        rowFor(report, 'derived:jovie:production-promotion')
      ).toMatchObject({
        status: 'fresh',
        reason: 'production-current',
      });
      expect(attempts).toBe(2);
      expect(livenessDecisions(report)).toEqual([]);
    }
  );

  it('reads main through the default shared client', async () => {
    vi.stubEnv('JOVIE_API_STATE', 'memory');
    try {
      const { report } = await runLivenessImpl({
        registry: only('derived:jovie:production-promotion'),
        nowMs: NOW,
        fetchImpl: fakeFetch({
          'jov.ie/api/health/build-info': { commitSha: MAIN },
          '/git/ref/heads/main': mainRef(MAIN),
        }),
      });
      expect(
        rowFor(report, 'derived:jovie:production-promotion')
      ).toMatchObject({
        status: 'fresh',
        reason: 'production-current',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('keeps a quota reset beyond the read budget red without waiting', async () => {
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'jov.ie/api/health/build-info': { commitSha: MAIN },
        '/git/ref/heads/main': new Response('{}', {
          status: 429,
          headers: { 'Retry-After': '60' },
        }),
      }),
    });
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'unknown',
      reason: 'main-ref-http-429',
    });
    expect(livenessDecisions(report)[0].action).toBe('red');
  });

  it('keeps malformed main-ref JSON red with an unreadable reason', async () => {
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'jov.ie/api/health/build-info': { commitSha: MAIN },
        '/git/ref/heads/main': new Response('not-json'),
      }),
    });
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'unknown',
      reason: 'main-ref-unreadable',
    });
    expect(livenessDecisions(report)[0].action).toBe('red');
  });

  it.each([401, 403, 404, 429, 503])(
    'keeps an HTTP %s main-ref failure red with its diagnostic reason',
    async status => {
      let attempts = 0;
      const { report } = await runLiveness({
        registry: only('derived:jovie:production-promotion'),
        nowMs: NOW,
        fetchImpl: fakeFetch({
          'jov.ie/api/health/build-info': { commitSha: MAIN },
          '/git/ref/heads/main': () => {
            attempts += 1;
            return status;
          },
        }),
      });
      expect(
        rowFor(report, 'derived:jovie:production-promotion')
      ).toMatchObject({
        status: 'unknown',
        reason: status === 429 ? 'main-ref-shed' : `main-ref-http-${status}`,
      });
      expect(attempts).toBe(status === 503 ? 2 : 1);
      expect(livenessDecisions(report)[0].action).toBe('red');
    }
  );

  it.each([
    [{ name: 'AbortError' }, 'transient'],
    [new Error('connection reset'), 'transient'],
  ])('keeps a failed main-ref transport red (%j)', async (error, reason) => {
    const buildFetch = fakeFetch({
      'jov.ie/api/health/build-info': { commitSha: MAIN },
    });
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: async url => {
        if (String(url).includes('/git/ref/heads/main')) throw error;
        return buildFetch(url);
      },
    });
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'unknown',
      reason: `main-ref-${reason}`,
    });
    expect(livenessDecisions(report)[0].action).toBe('red');
  });

  it.each([
    {},
    mainRef('invalid'),
    { ref: 'refs/heads/main', object: { type: 'tree', sha: MAIN } },
    { ref: 'refs/heads/other', object: { type: 'commit', sha: MAIN } },
  ])('rejects malformed or unrelated main refs (%j)', async ref => {
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'jov.ie/api/health/build-info': { commitSha: MAIN },
        '/git/ref/heads/main': ref,
      }),
    });
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'unknown',
      reason: 'main-sha-unreadable',
    });
    expect(livenessDecisions(report)[0].action).toBe('red');
  });

  it('(a) a guard that stops producing verdicts is itself silent', async () => {
    const { report } = await runLiveness({
      registry: only('github:jovie:production-continuity'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'production-continuity.yml/runs': runs(
          [45, 'success', 2],
          [3, 'cancelled', 3]
        ),
      }),
    });
    expect(rowFor(report, 'github:jovie:production-continuity')).toMatchObject({
      status: 'stale',
      ageMinutes: 45,
    });
  });

  // (b) 2026-10-20 18:01-19:3x: the public lanes status gist stopped updating
  // and nothing alerted.
  it('(b) a stale public lanes status gist alerts', async () => {
    const { report } = await runLiveness({
      registry: only('gem:lanes-tick'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'lanes-status.json': {
          schema: 'symphony-lanes-status/v1',
          at: '2026-10-20T18:01:00Z',
        },
      }),
    });
    expect(rowFor(report, 'gem:lanes-tick')).toMatchObject({
      status: 'stale',
      ageMinutes: 94,
    });
    const [decision] = livenessDecisions(report);
    expect(decision).toMatchObject({
      action: 'red',
      fingerprint: 'automation-liveness-gem-lanes-tick',
    });
    expect(decision.detail).toMatch(/max silence 30m/);
    expect(decision.detail).toMatch(/Escalation owner: gem/);
  });

  it('(b) an unreachable gist is silence', async () => {
    const { report } = await runLiveness({
      registry: only('gem:lanes-tick'),
      nowMs: NOW,
      fetchImpl: fakeFetch({}),
    });
    expect(rowFor(report, 'gem:lanes-tick').status).toBe('unknown');
  });

  // (c) Summer's model turns failed for two days with no escalation, while
  // its provider-read receipts stayed fresh.
  it('(c) failing Summer model turns alert even while provider receipts are fresh', async () => {
    const health = {
      receiptFreshness: {
        githubRead: { status: 'verified', observedAt: iso(5) },
        modelTurn: { status: 'verified', observedAt: iso(2 * 24 * 60) },
      },
    };
    const { report } = await runLiveness({
      registry: only('summer:model-turns', 'summer:provider-receipts'),
      nowMs: NOW,
      fetchImpl: fakeFetch({ 'summer.jov.ie/runtime/v1/health': health }),
    });
    expect(rowFor(report, 'summer:provider-receipts').status).toBe('fresh');
    expect(rowFor(report, 'summer:model-turns')).toMatchObject({
      status: 'stale',
      ageMinutes: 2880,
    });
    expect(livenessDecisions(report).map(row => row.id)).toEqual([
      'summer:model-turns',
    ]);
  });

  it('(c) a missing or failed model-turn heartbeat is red, never green', async () => {
    for (const modelTurn of [
      undefined,
      { status: 'failed', observedAt: iso(1) },
    ]) {
      const { report } = await runLiveness({
        registry: only('summer:model-turns'),
        nowMs: NOW,
        fetchImpl: fakeFetch({
          'summer.jov.ie/runtime/v1/health': {
            receiptFreshness: {
              githubRead: { status: 'verified', observedAt: iso(1) },
              modelTurn,
            },
          },
        }),
      });
      expect(rowFor(report, 'summer:model-turns').status).toBe('missing');
    }
  });

  // 2026-10-20 21:13-21:52Z: 10 entries sat AWAITING_CHECKS for 39 min and
  // nothing alarmed (JOV-8706). Silence while the queue is non-empty is red;
  // max silence 45 min = ~2x merge-group p95 (23.9 min, 48h to 2026-10-21).
  it('a non-empty merge queue that stops merging is silent; an empty queue is fresh', async () => {
    const queue = (totalCount, enqueuedMinutesAgo, mergedMinutesAgo) => ({
      data: {
        repository: {
          mergeQueue: {
            entries: {
              totalCount,
              nodes: enqueuedMinutesAgo.map(m => ({ enqueuedAt: iso(m) })),
            },
          },
          pullRequests: {
            nodes: [
              { mergedAt: iso(mergedMinutesAgo + 30) },
              { mergedAt: iso(mergedMinutesAgo) },
            ],
          },
        },
      },
    });
    const run = body =>
      runLiveness({
        registry: only('github:jovie:merge-queue-progress'),
        nowMs: NOW,
        token: 't',
        fetchImpl: fakeFetch({ '/graphql': body }),
      }).then(({ report }) =>
        rowFor(report, 'github:jovie:merge-queue-progress')
      );
    const stalled = await run(queue(10, [60, 55], 50));
    expect(stalled.status).toBe('stale');
    expect(stalled.ageMinutes).toBe(50);
    // One ejection rebuild (~p95 23 min) inside 45 min is normal operation.
    expect((await run(queue(10, [60, 55], 39))).status).toBe('fresh');
    // A PR queued after a quiet stretch is not a stall yet.
    expect((await run(queue(1, [2], 300))).status).toBe('fresh');
    expect((await run(queue(0, [], 600))).status).toBe('fresh');
    // Unreadable or unauthenticated is silence, never health.
    expect((await run(502)).status).not.toBe('fresh');
    const unauth = await runLiveness({
      registry: only('github:jovie:merge-queue-progress'),
      nowMs: NOW,
      fetchImpl: fakeFetch({ '/graphql': queue(0, [], 0) }),
    });
    expect(
      rowFor(unauth.report, 'github:jovie:merge-queue-progress').status
    ).not.toBe('fresh');
  });

  it('only counts the configured trigger events for scheduled baselines', async () => {
    const { report } = await runLiveness({
      registry: only('github:jovie:security'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'security.yml/runs': runs(
          [10, 'success', 2, 'push'],
          [9 * 24 * 60, 'failure', 1, 'schedule']
        ),
      }),
    });
    expect(rowFor(report, 'github:jovie:security').status).toBe('missing');
  });
});

describe('liveness run receipts', () => {
  it('reads scheduled runs that 30 newer push runs would hide', async () => {
    const pushes = Array.from({ length: 30 }, (_, i) => [
      i + 1,
      'success',
      100 + i,
      'push',
    ]);
    const { report } = await runLiveness({
      registry: only('github:jovie:security'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'security.yml/runs': url =>
          url.includes('event=schedule')
            ? runs([2 * 24 * 60, 'success', 1, 'schedule'])
            : url.includes('event=')
              ? runs()
              : runs(...pushes),
      }),
    });
    expect(rowFor(report, 'github:jovie:security').status).toBe('fresh');
  });

  it('emits receipts for observed runs during a liveness pass', async () => {
    const { events } = await runLiveness({
      registry: only('github:jovie:production-continuity'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'production-continuity.yml/runs': runs([2, 'failure', 7]),
      }),
    });
    expect(events.map(row => [row.stage, row.outcome])).toEqual([
      ['started', 'advanced'],
      ['finished', 'failed'],
    ]);
  });
});
