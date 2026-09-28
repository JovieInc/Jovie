import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initialCursors,
  interpretAuthorityRead,
  laneIssueIdentifier,
  projectDelivery,
  publishShippingState,
  resetShippingStatePublisher,
  SHIPPING_SOURCE_IDS,
  type ShippingSourceId,
  snapshotReaders,
} from '@/lib/ovie/shipping-state';
import {
  createLiveShippingStateReaders,
  type LiveIo,
  NAMED_AUTHORITY_URLS,
  pacificMidnightIso,
  readLanePullRequests,
  readLanesStatus,
  readLiveBuild,
  readMerges,
  readSummerRuntime,
  SOURCE_CACHE_TTL_MS,
} from '@/lib/ovie/shipping-state/live';

const NOW = Date.parse('2026-09-27T02:00:00.000Z');
const LIVE_SHA = 'ee7401f37e0b324e225751f0d97ce229838ac8b4';

/** Shape of the published feed at 2026-09-27T01:55Z (JOV-6700 evidence). */
const LANES_FEED = {
  schema: 'symphony-lanes-status/v1',
  at: '2026-09-27T01:59:00Z',
  host: 'gem',
  release: '2a69bf3',
  lanes: {
    devin: { running: 4, slots: 4 },
    hyperagent: { running: 0, slots: 2 },
    codex: { running: 3, slots: 3 },
  },
  running: 7,
  idle: 2,
  pool: 200,
  lastLandingAgeS: 1440.4,
  alerts: { 'failed-runs': '61 harness-failed runs in 24h' },
  diskFreePct: 29,
  held_by_reason: { 'gate-check-failed': 10, 'missing-test': 2 },
  failed_by_reason: { legacy: 28 },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function timeoutError() {
  return Object.assign(new Error('The operation was aborted due to timeout'), {
    name: 'TimeoutError',
  });
}

function io(
  fetchImpl: LiveIo['fetch'],
  overrides: Omit<Partial<LiveIo>, 'fetch'> = {}
) {
  return {
    fetch: vi.fn(fetchImpl),
    githubToken: 'hud-token',
    githubOwner: 'JovieInc',
    githubRepo: 'Jovie',
    nowMs: () => NOW,
    ...overrides,
  };
}

function graphqlBody(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body)) as {
    query: string;
    variables: Record<string, string>;
  };
}

function lanePr(overrides: Record<string, unknown>) {
  return {
    number: 1,
    title: 'Lane work',
    headRefName: 'devin/jov-1-20260927t000000',
    headRefOid: LIVE_SHA,
    isDraft: true,
    mergeable: 'MERGEABLE',
    reviewDecision: null,
    updatedAt: '2026-09-27T01:00:00Z',
    mergeQueueEntry: null,
    ...overrides,
  };
}

afterEach(() => {
  resetShippingStatePublisher();
});

describe('lanes-status (symphony-lanes-status/v1 gist)', () => {
  it('reads running / slots / pool / alerts from the published feed', async () => {
    const live = io(async () => json(LANES_FEED));
    const read = await readLanesStatus(live);

    expect(live.fetch.mock.calls[0]?.[0]).toBe(
      NAMED_AUTHORITY_URLS['lanes-status']
    );
    expect(live.fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(read).toMatchObject({
      status: 'ok',
      sourceTimestamp: '2026-09-27T01:59:00.000Z',
      sourceRevision: '2a69bf3',
      delivery: {
        lanes: {
          running: { state: 'measured-nonzero', value: 7 },
          slots: { state: 'measured-nonzero', value: 9 },
          idle: { state: 'measured-nonzero', value: 2 },
          pool: { state: 'measured-nonzero', value: 200 },
          lastLandingAgeSeconds: { state: 'measured-nonzero', value: 1440 },
          diskFreePct: 29,
          alerts: ['61 harness-failed runs in 24h'],
          heldByReason: { 'gate-check-failed': 10, 'missing-test': 2 },
          failedByReason: { legacy: 28 },
          lanes: [
            { name: 'devin', running: 4, slots: 4 },
            { name: 'hyperagent', running: 0, slots: 2 },
            { name: 'codex', running: 3, slots: 3 },
          ],
        },
      },
    });

    const projection = await publishShippingState({
      readers: snapshotReaders({ 'lanes-status': read }),
      clock: { nowIso: () => new Date(NOW).toISOString(), nowMs: () => NOW },
    });
    expect(projection.delivery.lanes.stale).toBe(false);
    expect(projection.capacityAvailable).toEqual({
      state: 'measured-nonzero',
      value: 2,
    });
  });

  it('marks the lanes block stale when `at` is older than ten minutes', async () => {
    const read = await readLanesStatus(
      io(async () => json({ ...LANES_FEED, at: '2026-09-27T01:49:59Z' }))
    );
    const projection = await publishShippingState({
      readers: snapshotReaders({ 'lanes-status': read }),
      clock: { nowIso: () => new Date(NOW).toISOString(), nowMs: () => NOW },
    });

    expect(projection.sources['lanes-status'].state).toBe('stale');
    expect(projection.delivery.lanes).toMatchObject({
      stale: true,
      running: { value: 7 },
    });
  });

  it('fails soft to n/a on timeout', async () => {
    const read = await readLanesStatus(
      io(async () => {
        throw timeoutError();
      })
    );
    expect(read).toMatchObject({ status: 'disconnected', payload: null });
    expect(read.delivery).toBeUndefined();
  });

  it.each([
    ['wrong schema', { ...LANES_FEED, schema: 'symphony-runtime-state/v1' }],
    ['missing at', { ...LANES_FEED, at: 'yesterday' }],
    [
      'non-integer lane slots',
      { ...LANES_FEED, lanes: { devin: { running: 1, slots: '4' } } },
    ],
    ['missing running', { ...LANES_FEED, running: null }],
  ])('rejects a bad shape (%s) as unavailable', async (_label, body) => {
    const read = await readLanesStatus(io(async () => json(body)));
    expect(read).toMatchObject({
      sourceId: 'lanes-status',
      status: 'unavailable',
      errorCode: 'malformed',
    });
  });
});

describe('lane-pull-requests (open devin/ and codex/ PRs)', () => {
  it('searches each lane head prefix and keeps only lane branches', async () => {
    const live = io(async (_url, init) => {
      const { variables } = graphqlBody(init);
      const lane = variables.query?.includes('head:codex/') ? 'codex' : 'devin';
      return json({
        data: {
          search: {
            issueCount: lane === 'devin' ? 3 : 1,
            nodes:
              lane === 'devin'
                ? [
                    lanePr({ number: 18934 }),
                    lanePr({
                      number: 18935,
                      headRefName: 'devin/jov-6095-20260927t045114',
                      mergeQueueEntry: { position: 2 },
                    }),
                    // Search matches `head:` loosely; this is not a lane.
                    lanePr({
                      number: 18856,
                      headRefName: 'dependabot/devin/whatever',
                    }),
                  ]
                : [
                    lanePr({
                      number: 18921,
                      headRefName: 'codex/jov-2905-20260927t040433',
                      isDraft: false,
                      mergeable: 'CONFLICTING',
                    }),
                  ],
          },
        },
      });
    });
    const read = await readLanePullRequests(live);

    expect(live.fetch).toHaveBeenCalledTimes(2);
    const queries = live.fetch.mock.calls.map(
      ([, init]) => graphqlBody(init).variables.query
    );
    expect(queries).toEqual([
      'repo:JovieInc/Jovie is:pr is:open head:devin/',
      'repo:JovieInc/Jovie is:pr is:open head:codex/',
    ]);
    expect(read).toMatchObject({
      status: 'ok',
      truncated: false,
      delivery: { inFlight: { state: 'measured-nonzero', value: 3 } },
    });
    const numbers = (read.payload?.pullRequests as Array<{ number: number }>)
      .map(pr => pr.number)
      .sort();
    expect(numbers).toEqual([18921, 18934, 18935]);

    const cursor = initialCursors().get('lane-pull-requests');
    if (!cursor) throw new Error('missing cursor');
    const { observation } = interpretAuthorityRead(
      read,
      cursor,
      new Date(NOW).toISOString(),
      new Date(NOW).toISOString()
    );
    expect(
      observation.entities.map(entity => [
        entity.operationalTask?.linearIdentifier,
        entity.operationalTask?.workflowState,
      ])
    ).toEqual([
      ['JOV-6095', 'merge-queued'],
      ['JOV-2905', 'blocked'],
      ['JOV-1', 'running'],
    ]);
    expect(observation.counts.blocked).toEqual({
      state: 'measured-nonzero',
      value: 1,
    });
  });

  it('does not report an exact in-flight count when a lane search is capped', async () => {
    const read = await readLanePullRequests(
      io(async () =>
        json({ data: { search: { issueCount: 150, nodes: [lanePr({})] } } })
      )
    );
    expect(read).toMatchObject({ status: 'ok', truncated: true, delivery: {} });
  });

  it('keeps the lanes that answered when one lane search fails', async () => {
    const read = await readLanePullRequests(
      io(async (_url, init) => {
        if (graphqlBody(init).variables.query?.includes('head:codex/')) {
          throw timeoutError();
        }
        return json({
          data: { search: { issueCount: 1, nodes: [lanePr({ number: 7 })] } },
        });
      })
    );
    expect(read).toMatchObject({ status: 'ok', truncated: true, delivery: {} });
    expect(
      (read.payload?.pullRequests as Array<{ number: number }>).map(
        pr => pr.number
      )
    ).toEqual([7]);
  });

  it('fails soft to n/a on timeout', async () => {
    const read = await readLanePullRequests(
      io(async () => {
        throw timeoutError();
      })
    );
    expect(read).toMatchObject({ status: 'unavailable', payload: null });
    expect(read.delivery).toBeUndefined();
  });

  it.each([
    ['no search', { data: {} }],
    [
      'bad node',
      { data: { search: { issueCount: 1, nodes: [{ number: 'x' }] } } },
    ],
    ['graphql errors', { data: { search: null }, errors: [{ message: 'no' }] }],
  ])('rejects a bad shape (%s) as unavailable', async (_label, body) => {
    const read = await readLanePullRequests(io(async () => json(body)));
    expect(read).toMatchObject({ status: 'unavailable', payload: null });
  });

  it('reads the Linear issue from a lane branch name', () => {
    expect(laneIssueIdentifier('devin/jov-5905-20260927t034623')).toBe(
      'JOV-5905'
    );
    expect(laneIssueIdentifier('codex/jov-12')).toBe('JOV-12');
    expect(laneIssueIdentifier('dependabot/npm/jov-1')).toBeNull();
    expect(laneIssueIdentifier('devin/no-issue')).toBeNull();
  });
});

describe('github-merges (search issueCount)', () => {
  const counts = {
    org: { issueCount: 292 },
    jovie: { issueCount: 189 },
    lyb: { issueCount: 17 },
    summer: { issueCount: 26 },
    last7: { issueCount: 862 },
    prior7: { issueCount: 225 },
  };

  it('counts merges since Pacific midnight per repo and org, plus WoW windows', async () => {
    const live = io(async () => json({ data: counts }));
    const read = await readMerges(live);

    expect(live.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = live.fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.github.com/graphql');
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer hud-token'
    );
    expect(graphqlBody(init).variables).toEqual({
      org: 'org:JovieInc is:pr is:merged merged:>=2026-09-26T07:00:00Z',
      jovie:
        'repo:JovieInc/Jovie is:pr is:merged merged:>=2026-09-26T07:00:00Z',
      lyb: 'repo:JovieInc/LogYourBody is:pr is:merged merged:>=2026-09-26T07:00:00Z',
      summer:
        'repo:JovieInc/summer-config is:pr is:merged merged:>=2026-09-26T07:00:00Z',
      last7: 'org:JovieInc is:pr is:merged merged:>=2026-09-20T02:00:00Z',
      prior7:
        'org:JovieInc is:pr is:merged merged:2026-09-13T02:00:00Z..2026-09-20T02:00:00Z',
    });
    expect(read).toMatchObject({
      status: 'ok',
      measuredMeanings: { merged: true },
      delivery: {
        merges: {
          since: '2026-09-26T07:00:00Z',
          today: { state: 'measured-nonzero', value: 292 },
          byRepo: {
            Jovie: { state: 'measured-nonzero', value: 189 },
            LogYourBody: { state: 'measured-nonzero', value: 17 },
            'summer-config': { state: 'measured-nonzero', value: 26 },
          },
          last7Days: { state: 'measured-nonzero', value: 862 },
          prior7Days: { state: 'measured-nonzero', value: 225 },
        },
      },
    });
  });

  it('keeps a zero-merge day as measured zero', async () => {
    const read = await readMerges(
      io(async () =>
        json({
          data: { ...counts, org: { issueCount: 0 }, jovie: { issueCount: 0 } },
        })
      )
    );
    expect(read.delivery?.merges?.today).toEqual({
      state: 'measured-zero',
      value: 0,
    });
    expect(read.measuredMeanings?.merged).toBe(false);
  });

  it('fails soft to n/a on timeout and without a token', async () => {
    const timedOut = await readMerges(
      io(async () => {
        throw timeoutError();
      })
    );
    expect(timedOut).toMatchObject({ status: 'unavailable', payload: null });

    const fetchMock = vi.fn();
    const unconfigured = await readMerges(
      io(fetchMock, { githubToken: undefined })
    );
    expect(unconfigured).toMatchObject({ status: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing alias', { data: { ...counts, prior7: undefined } }],
    ['negative count', { data: { ...counts, org: { issueCount: -1 } } }],
    ['string count', { data: { ...counts, lyb: { issueCount: '17' } } }],
  ])('rejects a bad shape (%s) as unavailable', async (_label, body) => {
    const read = await readMerges(io(async () => json(body)));
    expect(read).toMatchObject({
      status: 'unavailable',
      errorCode: 'malformed',
    });
  });

  it('pins "today" to Pacific midnight across daylight saving', () => {
    expect(pacificMidnightIso(Date.parse('2026-09-27T02:00:00Z'))).toBe(
      '2026-09-26T07:00:00Z'
    );
    expect(pacificMidnightIso(Date.parse('2026-09-27T07:00:00Z'))).toBe(
      '2026-09-27T07:00:00Z'
    );
    expect(pacificMidnightIso(Date.parse('2026-12-15T20:00:00Z'))).toBe(
      '2026-12-15T08:00:00Z'
    );
    // 2026-11-01 PT falls back at 02:00; midnight that day is still PDT.
    expect(pacificMidnightIso(Date.parse('2026-11-01T18:00:00Z'))).toBe(
      '2026-11-01T07:00:00Z'
    );
  });
});

describe('live-build-info (jov.ie build-info + behind main)', () => {
  const BUILD = {
    buildId: 'Vzk6W7a9vP1VhJ8NuaKrX',
    version: '26.9.15',
    deployedAt: Date.parse('2026-09-27T01:00:00Z'),
    commitSha: LIVE_SHA,
    environment: 'production',
  };

  it('reads the prod SHA and version, and how far main is ahead', async () => {
    const live = io(async url =>
      String(url) === NAMED_AUTHORITY_URLS['live-build-info']
        ? json(BUILD)
        : json({
            data: { repository: { ref: { compare: { behindBy: 54 } } } },
          })
    );
    const read = await readLiveBuild(live);

    expect(graphqlBody(live.fetch.mock.calls[1]?.[1]).variables).toEqual({
      owner: 'JovieInc',
      name: 'Jovie',
      sha: LIVE_SHA,
    });
    expect(read).toMatchObject({
      status: 'ok',
      sourceRevision: LIVE_SHA,
      correlation: { sha: LIVE_SHA, buildId: 'Vzk6W7a9vP1VhJ8NuaKrX' },
      delivery: {
        production: {
          sha: LIVE_SHA,
          version: '26.9.15',
          deployedAt: '2026-09-27T01:00:00.000Z',
          behindMain: { state: 'measured-nonzero', value: 54 },
        },
      },
    });
  });

  it('keeps the build when the compare fails, with behind-main n/a', async () => {
    const read = await readLiveBuild(
      io(async url => {
        if (String(url) === NAMED_AUTHORITY_URLS['live-build-info']) {
          return json(BUILD);
        }
        throw timeoutError();
      })
    );
    expect(read.delivery?.production).toMatchObject({
      sha: LIVE_SHA,
      behindMain: { state: 'not-measured', value: null },
    });
  });

  it('fails soft to n/a on timeout or a non-object body', async () => {
    const timedOut = await readLiveBuild(
      io(async () => {
        throw timeoutError();
      })
    );
    expect(timedOut).toMatchObject({ status: 'disconnected' });
    const bad = await readLiveBuild(io(async () => json(['not', 'object'])));
    expect(bad).toMatchObject({ status: 'error', errorCode: 'malformed' });
  });
});

describe('summer-runtime (summer.jov.ie /runtime/v1/health)', () => {
  it('reads Summer availability from its public health channel', async () => {
    const live = io(async () =>
      json({ identity: 'summer', availability: 'up', commissioned: false })
    );
    const read = await readSummerRuntime(live);
    expect(live.fetch.mock.calls[0]?.[0]).toBe(
      'https://summer.jov.ie/runtime/v1/health'
    );
    expect(read).toMatchObject({
      status: 'ok',
      delivery: { summer: { availability: 'up' } },
    });
  });

  it('accepts the materializer health shape that reports status', async () => {
    const read = await readSummerRuntime(
      io(async () => json({ identity: 'summer', status: 'up' }))
    );
    expect(read.delivery?.summer).toEqual({ availability: 'up' });
  });

  it('maps an unrecognised availability to degraded, never up', async () => {
    const read = await readSummerRuntime(
      io(async () => json({ identity: 'summer', availability: 'warming' }))
    );
    expect(read.delivery?.summer).toEqual({ availability: 'degraded' });
  });

  it('fails soft to n/a on timeout or bad shape', async () => {
    const timedOut = await readSummerRuntime(
      io(async () => {
        throw timeoutError();
      })
    );
    expect(timedOut).toMatchObject({ status: 'disconnected' });
    const wrongService = await readSummerRuntime(
      io(async () => json({ identity: 'other', availability: 'up' }))
    );
    expect(wrongService).toMatchObject({
      status: 'unavailable',
      errorCode: 'malformed',
    });
    const http = await readSummerRuntime(io(async () => json({}, 503)));
    expect(http).toMatchObject({
      status: 'unavailable',
      errorCode: 'http-503',
    });
  });
});

describe('configured readers', () => {
  it('reuses a slow-moving read inside its TTL and retries a failure sooner', async () => {
    let now = NOW;
    let calls = 0;
    const readers = createLiveShippingStateReaders(
      io(
        async () => {
          calls += 1;
          return calls === 1 ? json({}, 502) : json(LANES_FEED);
        },
        { nowMs: () => now }
      )
    );

    expect((await readers['lanes-status']()).status).toBe('unavailable');
    now += 1_000;
    await readers['lanes-status']();
    expect(calls).toBe(1);
    now += 5_000;
    expect((await readers['lanes-status']()).status).toBe('ok');
    expect(calls).toBe(2);
    now += SOURCE_CACHE_TTL_MS['lanes-status'] - 1;
    await readers['lanes-status']();
    expect(calls).toBe(2);
    now += 1;
    await readers['lanes-status']();
    expect(calls).toBe(3);
  });

  it('measures the failure TTL from when the read settles, not request start', async () => {
    let now = NOW;
    let calls = 0;
    let resolveFetch: ((response: Response) => void) | null = null;
    const readers = createLiveShippingStateReaders(
      io(
        () =>
          new Promise<Response>(resolve => {
            calls += 1;
            resolveFetch = resolve;
          }),
        { nowMs: () => now }
      )
    );

    const pending = readers['lanes-status']();
    now += 6_000;
    resolveFetch?.(json({}, 502));
    expect((await pending).status).toBe('unavailable');

    now += 3_999;
    const cachedPoll = readers['lanes-status']();
    expect(calls).toBe(1);
    resolveFetch?.(json(LANES_FEED));
    await cachedPoll;

    now += 2;
    const retry = readers['lanes-status']();
    resolveFetch?.(json(LANES_FEED));
    expect((await retry).status).toBe('ok');
    expect(calls).toBe(2);
  });

  it('fails each source soft: one dead source leaves only its metrics n/a', async () => {
    const reads = Object.fromEntries(
      SHIPPING_SOURCE_IDS.map(id => [id, undefined])
    ) as Record<ShippingSourceId, undefined>;
    const lanes = await readLanesStatus(io(async () => json(LANES_FEED)));
    const projection = await publishShippingState({
      readers: snapshotReaders({ ...reads, 'lanes-status': lanes }),
      clock: { nowIso: () => new Date(NOW).toISOString(), nowMs: () => NOW },
    });

    expect(projection.state).toBe('partial');
    expect(projection.delivery.lanes.running.value).toBe(7);
    expect(projection.delivery.merges.today.state).toBe('not-measured');
    expect(projection.delivery.production.sha).toBeNull();
    expect(projection.delivery.summer.availability).toBeNull();
    expect(projectDelivery(projection.sources)).toEqual(projection.delivery);
  });
});
