import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../packages/api-client/client.ts';
import { MemoryLedgerStore } from '../../../packages/api-client/store.ts';
import {
  lsRemoteMain,
  runLiveness as runLivenessImpl,
} from '../../automation-liveness.mjs';
import { ADMISSION_BLOCKING_LABELS } from '../admission-hold-labels.mjs';
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
    // Keep the suite off the network. Tests that cover the git fallback pass
    // their own reader.
    lsRemote: async () => null,
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

describe('ls-remote main tip', () => {
  it('asks git for refs/heads/main and keeps the token out of argv', async () => {
    const token = 'actions-token';
    const encoded = Buffer.from(`x-access-token:${token}`).toString('base64');
    // Assigned inside the git callback. An uninitialized let stays
    // possibly undefined under checkJs, which the scripts ratchet rejects.
    const seen = {
      args: /** @type {string[]} */ ([]),
      env: /** @type {NodeJS.ProcessEnv} */ ({}),
    };
    const sha = await lsRemoteMain(
      'JovieInc/Jovie',
      token,
      async (args, env) => {
        seen.args = args;
        seen.env = env;
        return `${MAIN}\trefs/heads/main\n`;
      }
    );
    expect(sha).toBe(MAIN);
    expect(seen.args).toEqual([
      'ls-remote',
      '--refs',
      'https://github.com/JovieInc/Jovie.git',
      'refs/heads/main',
    ]);
    expect(JSON.stringify(seen.args)).not.toContain(token);
    expect(JSON.stringify(seen.args)).not.toContain(encoded);
    expect(seen.env.GIT_CONFIG_VALUE_0).toBe('/dev/null');
    expect(seen.env.GIT_CONFIG_VALUE_2).toBe(`AUTHORIZATION: basic ${encoded}`);
    expect(seen.env.GIT_TERMINAL_PROMPT).toBe('0');
  });

  it('returns null for a bad repo, a bad tip, or a git failure', async () => {
    const gitExec = async () => {
      throw new Error('network');
    };
    await expect(lsRemoteMain('not a repo', 't', gitExec)).resolves.toBeNull();
    await expect(
      lsRemoteMain('JovieInc/Jovie', 't', async () => 'nope')
    ).resolves.toBeNull();
    await expect(
      lsRemoteMain('JovieInc/Jovie', 't', gitExec)
    ).resolves.toBeNull();
  });
});

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

  // Run 39674054063: git/ref answered 403 while production was on main.
  // The commit SHA media type is the alternate contents read.
  it('reads main from the commit SHA when the git ref answers 403', async () => {
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'jov.ie/api/health/build-info': { commitSha: LIVE },
        '/git/ref/heads/main': 403,
        '/commits/main': new Response(`${MAIN}\n`, {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
        [`/compare/${LIVE}...${MAIN}`]: {
          ahead_by: 1,
          commits: [
            {
              sha: MAIN,
              commit: { committer: { date: iso(30) } },
            },
          ],
        },
      }),
    });
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'fresh',
      ageMinutes: 30,
      reason: '1-commits-unshipped',
    });
    expect(livenessDecisions(report)).toEqual([]);
  });

  it('keeps a 403 red when the commit SHA read also fails', async () => {
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      lsRemote: async () => {
        throw new Error('git down');
      },
      fetchImpl: fakeFetch({
        'jov.ie/api/health/build-info': { commitSha: MAIN },
        '/git/ref/heads/main': 403,
        '/commits/main': 403,
      }),
    });
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'unknown',
      reason: 'main-ref-http-403',
    });
    expect(livenessDecisions(report)[0].action).toBe('red');
  });

  // Run 39682307911 checked out the commits/main fallback and still recorded
  // main-ref-http-403. The git protocol is the read that does not spend REST.
  it('reads main with git ls-remote when both REST reads answer 403', async () => {
    const calls = [];
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      token: 'actions-token',
      lsRemote: async (repo, token) => {
        calls.push([repo, token]);
        return MAIN;
      },
      fetchImpl: fakeFetch({
        'jov.ie/api/health/build-info': { commitSha: MAIN },
        '/git/ref/heads/main': 403,
        '/commits/main': 403,
      }),
    });
    expect(calls).toEqual([['JovieInc/Jovie', 'actions-token']]);
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'fresh',
      reason: 'production-current',
    });
    expect(livenessDecisions(report)).toEqual([]);
  });

  it('does not use git ls-remote for a non-403 main-ref failure', async () => {
    let called = false;
    const { report } = await runLiveness({
      registry: only('derived:jovie:production-promotion'),
      nowMs: NOW,
      lsRemote: async () => {
        called = true;
        return MAIN;
      },
      fetchImpl: fakeFetch({
        'jov.ie/api/health/build-info': { commitSha: MAIN },
        '/git/ref/heads/main': 404,
      }),
    });
    expect(called).toBe(false);
    expect(rowFor(report, 'derived:jovie:production-promotion')).toMatchObject({
      status: 'unknown',
      reason: 'main-ref-http-404',
    });
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

  // JOV-8799: Summer's observeReceipt reports a succeeded read as `stale`
  // once it is older than the 10-minute provider TTL. This dead-man keeps
  // its own 60-minute silence budget and still rejects unknown or failed reads.
  it.each([
    ['verified', 5, 'fresh'],
    ['stale', 11, 'fresh'],
    ['stale', 59, 'fresh'],
    ['stale', 60, 'fresh'],
    ['stale', 61, 'stale'],
    ['verified', 61, 'stale'],
    ['unknown', 1, 'missing'],
    ['failed', 1, 'missing'],
    [undefined, 1, 'missing'],
  ])(
    'gbrain read status %s at age %im respects the heartbeat budget (%s)',
    async (status, ageMinutes, expected) => {
      const { report } = await runLiveness({
        registry: only('derived:gbrain:read-path'),
        nowMs: NOW,
        fetchImpl: fakeFetch({
          'summer.jov.ie/runtime/v1/health': {
            receiptFreshness: {
              gbrainRead: { status, observedAt: iso(ageMinutes) },
            },
          },
        }),
      });
      const accepted = status === 'verified' || status === 'stale';
      expect(rowFor(report, 'derived:gbrain:read-path')).toMatchObject({
        status: expected,
        budgetMinutes: 60,
        lastProofAt: accepted ? iso(ageMinutes) : null,
        ageMinutes: accepted ? ageMinutes : null,
      });
      expect(livenessDecisions(report).map(row => row.action)).toEqual(
        expected === 'fresh' ? [] : ['red']
      );
      expect(
        livenessDecisions(report, {
          'automation-liveness-derived-gbrain-read-path': 'red',
        }).map(row => row.action)
      ).toEqual([expected === 'fresh' ? 'green' : 'red']);
    }
  );

  it.each([null, undefined, 'invalid'])(
    'a stale gbrain receipt without a valid timestamp (%s) is red',
    async observedAt => {
      const { report } = await runLiveness({
        registry: only('derived:gbrain:read-path'),
        nowMs: NOW,
        fetchImpl: fakeFetch({
          'summer.jov.ie/runtime/v1/health': {
            receiptFreshness: { gbrainRead: { status: 'stale', observedAt } },
          },
        }),
      });
      expect(rowFor(report, 'derived:gbrain:read-path').status).toBe('missing');
      expect(livenessDecisions(report)[0].action).toBe('red');
    }
  );

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

  // Tim 2026-10-21: Triage is sorted on the event, not a tick. The oldest
  // unsorted issue's age is the staleness; the dwell SLO is 15 min.
  it('a Triage issue older than the 15-minute dwell SLO is stale; an empty Triage is fresh', async () => {
    const triage = minutesAgo => ({
      graphql: async () => ({
        issues: {
          nodes: minutesAgo.map((m, index) => ({
            identifier: `JOV-${index + 1}`,
            createdAt: iso(m + 1000),
            startedTriageAt: iso(m),
          })),
        },
      }),
    });
    const run = linear =>
      runLiveness({
        registry: only('summer:triage-dwell'),
        nowMs: NOW,
        linear,
      }).then(({ report }) => rowFor(report, 'summer:triage-dwell'));
    const stuck = await run(triage([3, 40]));
    expect(stuck.status).toBe('stale');
    expect(stuck.ageMinutes).toBe(40);
    expect(stuck.reason).toContain('oldest=JOV-2');
    expect((await run(triage([3, 14]))).status).toBe('fresh');
    expect((await run(triage([]))).status).toBe('fresh');
    // No credential or a failed read is silence, never health.
    expect((await run(null)).status).not.toBe('fresh');
    const failing = {
      graphql: async () => {
        throw new Error('Linear GraphQL: unauthorized');
      },
    };
    expect((await run(failing)).status).not.toBe('fresh');
  });

  // Tim 2026-10-21: a required-green PR is promoted and enqueued on the
  // check event. Ready + green + outside the queue for over 10 min is stale.
  it('a ready PR whose head is required-green but not enqueued for 10+ minutes is stale', async () => {
    const pr = (number, extra = {}) => ({
      number,
      isDraft: false,
      isInMergeQueue: false,
      mergeStateStatus: 'CLEAN',
      baseRefName: 'main',
      headRefOid: String(number).repeat(40).slice(0, 40),
      labels: { nodes: [], pageInfo: { hasNextPage: false } },
      ...extra,
    });
    // PR Ready, Migration Guard and PR Size Guard are check runs; Fork PR
    // Gate is a commit status. Green time is the latest required success.
    const heads = greenMinutesAgo => ({
      check_runs: [
        {
          name: 'PR Ready',
          conclusion: 'success',
          completed_at: iso(greenMinutesAgo),
        },
        {
          name: 'Migration Guard',
          conclusion: 'success',
          completed_at: iso(greenMinutesAgo + 20),
        },
        {
          name: 'PR Size Guard',
          conclusion: 'success',
          completed_at: iso(greenMinutesAgo + 25),
        },
      ],
    });
    const status = greenMinutesAgo => ({
      statuses: [
        {
          context: 'Fork PR Gate',
          state: 'success',
          created_at: iso(greenMinutesAgo + 30),
        },
      ],
    });
    const run = (list, green = 30, overrides = {}) =>
      runLiveness({
        registry: only('github:jovie:green-to-enqueue'),
        nowMs: NOW,
        token: 't',
        fetchImpl: fakeFetch({
          '/graphql':
            typeof list === 'number'
              ? list
              : { data: { repository: { pullRequests: { nodes: list } } } },
          '/check-runs': overrides.runs ?? heads(green),
          '/status': overrides.status ?? status(green),
        }),
      }).then(({ report }) => rowFor(report, 'github:jovie:green-to-enqueue'));
    const waiting = await run([pr(1)]);
    expect(waiting.status).toBe('stale');
    expect(waiting.ageMinutes).toBe(30);
    expect(waiting.reason).toContain('#1:30m');
    // JOV-8788: #22378 was required-green but queue-poison deliberately
    // prevented admission. Use the writer's vocabulary, including machine
    // blocks, and keep held heads out of the capped timing reads.
    const labeled = (number, name) =>
      pr(number, {
        labels: { nodes: [{ name }], pageInfo: { hasNextPage: false } },
      });
    for (const name of ADMISSION_BLOCKING_LABELS) {
      const held = await run([labeled(22378, name.toUpperCase())]);
      expect(held.status, name).toBe('fresh');
      expect(held.reason).toContain('label-held=1[#22378]');
    }
    const mixed = await run([
      ...Array.from({ length: 10 }, (_, i) => labeled(20 + i, 'queue-poison')),
      labeled(1, 'lane-fix-dequeued'),
    ]);
    expect(mixed.status).toBe('stale');
    expect(mixed.reason).toContain('ready-green-unqueued=1[#1:30m]');
    // Removing the hold resumes the existing SLO; unreadable or truncated
    // labels cannot certify that a ready PR is eligible.
    expect((await run([pr(22378)])).status).toBe('stale');
    for (const labels of [
      undefined,
      { nodes: [] },
      { nodes: [], pageInfo: { hasNextPage: true } },
      { nodes: [{}], pageInfo: { hasNextPage: false } },
    ]) {
      const unreadable = await run([pr(1, { labels })]);
      expect(unreadable.status).not.toBe('fresh');
      expect(unreadable.reason).toContain('green-enqueue-labels-unreadable');
    }
    // Inside the SLO, queued, conflicting, blocked or another base: fresh.
    expect((await run([pr(2)], 5)).status).toBe('fresh');
    expect((await run([pr(3, { isInMergeQueue: true })])).status).toBe('fresh');
    expect((await run([pr(4, { mergeStateStatus: 'DIRTY' })])).status).toBe(
      'fresh'
    );
    expect((await run([pr(5, { mergeStateStatus: 'BLOCKED' })])).status).toBe(
      'fresh'
    );
    expect((await run([pr(6, { baseRefName: 'release' })])).status).toBe(
      'fresh'
    );
    // A required name with no success yet (status pending) is not green.
    expect(
      (
        await run([pr(7)], 30, {
          status: {
            statuses: [
              {
                context: 'Fork PR Gate',
                state: 'pending',
                created_at: iso(30),
              },
            ],
          },
        })
      ).status
    ).toBe('fresh');
    // A merge-queue failure hold for a real defect needs a new head from its
    // owner: reported, not promotion latency. A transient hold still counts.
    const holdStatus = cls => ({
      statuses: [
        ...status(30).statuses,
        {
          context: 'jovie-queue-failure-hold/v1',
          state: 'success',
          description: `class=${cls};n=1;run=1;try=1`,
          created_at: iso(20),
        },
      ],
    });
    const defect = await run([pr(10)], 30, {
      status: holdStatus('unclassified'),
    });
    expect(defect.status).toBe('fresh');
    expect(defect.reason).toContain('defect-held=1[#10]');
    expect(
      (
        await run([pr(11)], 30, {
          status: holdStatus('transient-infrastructure'),
        })
      ).status
    ).toBe('stale');
    // Green drafts are reported, but drafts belong to their writer.
    const draft = await run([pr(8, { isDraft: true })]);
    expect(draft.status).toBe('fresh');
    expect(draft.reason).toContain('draft-green=1[#8]');
    // Unreadable or unauthenticated is silence, never health.
    expect((await run(502)).status).not.toBe('fresh');
    expect((await run([pr(9)], 30, { runs: 502 })).status).not.toBe('fresh');
    const unauth = await runLiveness({
      registry: only('github:jovie:green-to-enqueue'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        '/graphql': { data: { repository: { pullRequests: { nodes: [] } } } },
      }),
    });
    expect(
      rowFor(unauth.report, 'github:jovie:green-to-enqueue').status
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
  // JOV-8832: run 39808881974 reported no M2 runs despite daily successes.
  // It also disagreed with itself about identical continuity receipts.
  it.each([
    ['github:jovie:m2-revenue-path-canary', false],
    ['github:jovie:m2-revenue-path-canary', true],
    ['github:jovie:production-continuity', false],
    ['github:jovie:production-continuity', true],
  ])(
    'confirms an empty or skipped-only history for %s (skipped=%s)',
    async (id, skipped) => {
      const seen = [];
      const { report, events } = await runLiveness({
        registry: only(id),
        nowMs: NOW,
        fetchImpl: fakeFetch({
          '/runs?': url => {
            const query = new URL(url).searchParams;
            seen.push(query);
            if (query.get('status') === 'success')
              return runs([10, 'success', 1]);
            if (query.get('status') === 'failure')
              return runs([2, 'failure', 2]);
            return skipped
              ? runs(
                  ...Array.from({ length: 30 }, (_, i) => [
                    1,
                    'skipped',
                    100 + i,
                  ])
                )
              : runs();
          },
        }),
      });
      expect(rowFor(report, id)).toMatchObject({
        status: 'fresh',
        lastProofAt: iso(2),
        url: 'https://github.com/JovieInc/Jovie/actions/runs/2',
      });
      expect(events.map(row => row.outcome)).toEqual(['advanced', 'failed']);
      expect(
        livenessDecisions(report, { [livenessFingerprint(id)]: 'red' })
      ).toEqual([expect.objectContaining({ action: 'green', id })]);
      expect(seen.map(query => query.get('status'))).toEqual([
        'completed',
        'success',
        'failure',
      ]);
      expect(seen.every(query => query.get('branch') === 'main')).toBe(true);
    }
  );

  it('keeps confirmed absence and old heartbeats red with bounded reads', async () => {
    const id = 'github:jovie:m2-revenue-path-canary';
    for (const stale of [false, true]) {
      let reads = 0;
      const { report } = await runLiveness({
        registry: only(id),
        nowMs: NOW,
        fetchImpl: fakeFetch({
          '/runs?': url => {
            reads += 1;
            return stale &&
              new URL(url).searchParams.get('status') === 'success'
              ? runs([4000, 'success', 1])
              : runs();
          },
        }),
      });
      expect(reads).toBe(3);
      expect(rowFor(report, id)).toMatchObject({
        status: stale ? 'stale' : 'missing',
        lastProofAt: stale ? iso(4000) : null,
      });
      expect(livenessDecisions(report)[0].action).toBe('red');
    }
  });

  it.each([
    [503, 'github-http-503'],
    [{}, 'github-runs-unreadable'],
    [new Response('not-json'), 'github-transport'],
  ])('keeps unreadable confirmation red (%j)', async (response, reason) => {
    const id = 'github:jovie:m2-revenue-path-canary';
    const { report } = await runLiveness({
      registry: only(id),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        '/runs?': url =>
          new URL(url).searchParams.get('status') === 'completed'
            ? runs()
            : response,
      }),
    });
    expect(rowFor(report, id)).toMatchObject({ status: 'unknown', reason });
    expect(livenessDecisions(report)[0].action).toBe('red');
  });

  it('preserves trigger filters while confirming a missing scheduled heartbeat', async () => {
    const seen = [];
    const { report } = await runLiveness({
      registry: only('github:jovie:security'),
      nowMs: NOW,
      fetchImpl: fakeFetch({
        'security.yml/runs': url => {
          const query = new URL(url).searchParams;
          seen.push(query);
          return query.get('status') === 'success' &&
            query.get('event') === 'schedule'
            ? runs([1, 'success', 2, 'push'], [120, 'success', 1, 'schedule'])
            : runs();
        },
      }),
    });
    expect(rowFor(report, 'github:jovie:security')).toMatchObject({
      status: 'fresh',
      lastProofAt: iso(120),
    });
    expect(seen).toHaveLength(4);
    expect(seen.every(query => query.get('branch') === 'main')).toBe(true);
    expect(seen.map(query => query.get('event'))).toEqual([
      'schedule',
      'workflow_dispatch',
      'schedule',
      'workflow_dispatch',
    ]);
  });

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
    const fetchImpl = vi.fn(
      fakeFetch({
        'production-continuity.yml/runs': runs([2, 'failure', 7]),
      })
    );
    const { events } = await runLiveness({
      registry: only('github:jovie:production-continuity'),
      nowMs: NOW,
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(events.map(row => [row.stage, row.outcome])).toEqual([
      ['started', 'advanced'],
      ['finished', 'failed'],
    ]);
  });
});
