import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetShippingStatePublisher } from '@/lib/ovie/shipping-state';
import { parseShippingCockpitProjection } from '@/lib/ovie/shipping-state/client';
import { NAMED_AUTHORITY_URLS } from '@/lib/ovie/shipping-state/live';
import { parseShippingStateProjection } from '@/lib/ovie/shipping-state-client';

/**
 * Contract: the real configured readers, publisher, and route, with only the
 * network and auth faked. The fetch fixtures are the truth sources recorded
 * in JOV-6700 (2026-09-27 ~02:00Z).
 */
const mockAuthorizeHud = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/hud', () => ({ authorizeHud: mockAuthorizeHud }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/next/schedule-after', () => ({ scheduleAfter: vi.fn() }));
vi.mock('@/lib/env-server', () => ({
  env: {
    HUD_GITHUB_TOKEN: 'hud-token',
    HUD_GITHUB_OWNER: 'JovieInc',
    HUD_GITHUB_REPO: 'Jovie',
  },
}));

const LIVE_SHA = '3c681618a36138011d44b7ec08f6d18a5023f0fc';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function graphql(init: RequestInit | undefined): Response {
  const { query, variables } = JSON.parse(String(init?.body)) as {
    query: string;
    variables: Record<string, string>;
  };
  if (query.includes('ShippingStateMerges')) {
    return json({
      data: {
        org: { issueCount: 295 },
        jovie: { issueCount: 189 },
        lyb: { issueCount: 17 },
        summer: { issueCount: 26 },
        last7: { issueCount: 862 },
        prior7: { issueCount: 225 },
      },
    });
  }
  if (query.includes('ShippingStateLanePullRequests')) {
    const lane = variables.query?.includes('head:codex/') ? 'codex' : 'devin';
    return json({
      data: {
        search: {
          issueCount: 1,
          nodes: [
            {
              number: lane === 'devin' ? 18917 : 18921,
              title: `${lane} lane work`,
              headRefName:
                lane === 'devin'
                  ? 'devin/jov-5905-20260927t034623'
                  : 'codex/jov-2905-20260927t040433',
              headRefOid: LIVE_SHA,
              isDraft: lane === 'devin',
              mergeable: 'MERGEABLE',
              reviewDecision: null,
              updatedAt: '2026-09-27T01:50:00Z',
              mergeQueueEntry: null,
            },
          ],
        },
      },
    });
  }
  if (query.includes('ShippingStateMergeQueue')) {
    return json({
      data: {
        repository: {
          pullRequests: { totalCount: 150 },
          mergeQueue: {
            entries: {
              totalCount: 4,
              pageInfo: { hasNextPage: false },
              nodes: [18868, 18576, 18803, 18867].map((number, index) => ({
                id: `mq-${number}`,
                position: index + 1,
                state: 'AWAITING_CHECKS',
                pullRequest: { number, headRefOid: LIVE_SHA },
              })),
            },
          },
        },
      },
    });
  }
  if (query.includes('ShippingStateBehindMain')) {
    return json({
      data: { repository: { ref: { compare: { behindBy: 12 } } } },
    });
  }
  return json({ errors: [{ message: 'unexpected query' }] });
}

function liveFetch(overrides: Record<string, () => Response> = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const override = overrides[url];
    if (override) return override();
    if (url === NAMED_AUTHORITY_URLS['lanes-status']) {
      return json({
        schema: 'symphony-lanes-status/v1',
        at: new Date(Date.now() - 60_000).toISOString(),
        lanes: {
          devin: { running: 4, slots: 4 },
          codex: { running: 3, slots: 3 },
          hyperagent: { running: 0, slots: 2 },
        },
        running: 7,
        idle: 2,
        pool: 200,
        lastLandingAgeS: 1440,
        alerts: { 'failed-runs': '61 harness-failed runs in 24h' },
        diskFreePct: 29,
      });
    }
    if (url === NAMED_AUTHORITY_URLS['live-build-info']) {
      return json({
        buildId: 'b1',
        version: '26.9.15',
        deployedAt: Date.now() - 3_600_000,
        commitSha: LIVE_SHA,
      });
    }
    if (url === NAMED_AUTHORITY_URLS['summer-runtime']) {
      return json({ identity: 'summer', availability: 'up' });
    }
    if (url === 'https://api.github.com/graphql') return graphql(init);
    if (url.endsWith('/commits/main')) return json({ sha: LIVE_SHA });
    if (url.includes('/actions/workflows/')) {
      return json({ workflow_runs: [] });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

async function getProjection() {
  const { GET } = await import('@/app/api/hud/shipping-state/route');
  const response = await GET(
    new NextRequest('http://localhost/api/hud/shipping-state')
  );
  return { response, body: await response.json() };
}

describe('GET /api/hud/shipping-state contract', () => {
  beforeEach(() => {
    vi.resetModules();
    resetShippingStatePublisher();
    mockAuthorizeHud.mockResolvedValue({ ok: true, mode: 'admin' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves live delivery truth that the card and the task panel both parse', async () => {
    vi.stubGlobal('fetch', liveFetch());
    const { response, body } = await getProjection();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.schema).toBe('ovie.shipping-state.v1');
    expect(body.state).not.toBe('unknown');
    expect(body.delivery).toMatchObject({
      lanes: {
        running: { value: 7 },
        slots: { value: 9 },
        stale: false,
        alerts: ['61 harness-failed runs in 24h'],
      },
      merges: {
        today: { value: 295 },
        byRepo: {
          Jovie: { value: 189 },
          LogYourBody: { value: 17 },
          'summer-config': { value: 26 },
        },
        last7Days: { value: 862 },
        prior7Days: { value: 225 },
      },
      mergeQueueDepth: { value: 4 },
      inFlight: { value: 2 },
      production: {
        sha: LIVE_SHA,
        version: '26.9.15',
        behindMain: { value: 12 },
      },
      summer: { availability: 'up' },
    });

    const cockpit = parseShippingCockpitProjection(body);
    expect(cockpit?.operationalTasks).toMatchObject({
      sourceId: 'lane-pull-requests',
      syncState: 'fresh',
    });
    expect(
      cockpit?.operationalTasks.tasks.map(task => task.linearIdentifier)
    ).toEqual(['JOV-2905', 'JOV-5905']);

    const card = parseShippingStateProjection(body);
    expect(card.ok).toBe(true);
    if (!card.ok) return;
    expect(card.projection.delivery.merges.today.value).toBe(295);
    expect(card.projection.inFlight.value).toBe(2);
  });

  it('fails each source soft: a dead GitHub leaves lanes, prod, and Summer measured', async () => {
    const githubDown = () => json({ message: 'Server Error' }, 502);
    vi.stubGlobal(
      'fetch',
      liveFetch({ 'https://api.github.com/graphql': githubDown })
    );
    const { response, body } = await getProjection();

    expect(response.status).toBe(200);
    expect(body.state).toBe('partial');
    expect(body.delivery.merges.today).toEqual({
      state: 'not-measured',
      value: null,
    });
    expect(body.delivery.mergeQueueDepth.state).toBe('not-measured');
    expect(body.delivery.inFlight.state).toBe('not-measured');
    expect(body.delivery.production.behindMain.state).toBe('not-measured');
    expect(body.delivery.lanes.running.value).toBe(7);
    expect(body.delivery.production.sha).toBe(LIVE_SHA);
    expect(body.delivery.summer.availability).toBe('up');
    expect(body.operationalTasks.syncState).toBe('failed');
  });
});
