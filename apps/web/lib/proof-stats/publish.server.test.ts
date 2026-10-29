import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProofStatsRecord } from './content-kind';

const state = vi.hoisted(() => ({
  live: null as ProofStatsRecord | null,
  versions: [] as unknown[],
  published: [] as unknown[],
  counts: {} as Record<string, number | Error>,
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/content-records/store.server', () => ({
  getLiveContent: vi.fn(async () => ({
    data: state.live ?? {
      schemaVersion: 1,
      observations: {},
      publishable: [],
      events: [],
    },
    versionId: state.live ? 'v-live' : null,
  })),
  createContentVersion: vi.fn(
    async (_kind, input: { data: ProofStatsRecord }) => {
      state.versions.push(input);
      state.live = input.data;
      return { id: `v-${state.versions.length}` };
    }
  ),
  publishContentVersion: vi.fn(async (_kind, input) => {
    state.published.push(input);
    return {};
  }),
}));
vi.mock('./queries.server', () => ({
  measureProductionStat: vi.fn(async (ref: string) => {
    const value = state.counts[ref];
    if (value instanceof Error) throw value;
    return value ?? 0;
  }),
}));
const {
  getPublicProofComparison,
  getPublicProofStat,
  getPublicProofStats,
  recordProofObservations,
  refreshProofStats,
} = await import('./publish.server');
const T0 = new Date('2026-10-29T12:00:00.000Z');
const at = (hours: number) => new Date(T0.getTime() + hours * 3_600_000);
describe('proof-stat publishing', () => {
  beforeEach(() => {
    state.live = null;
    state.versions = [];
    state.published = [];
    state.counts = {
      accounts_total: 999,
      artists_claimed: 3,
      smart_links_total: 0,
      release_alerts_delivered: 0,
    };
  });
  it('measures production stats and records the first milestones', async () => {
    const result = await refreshProofStats(T0);
    expect(result).toMatchObject({ measured: 4, failed: [], written: true });
    const events = state.live?.events.map(event => event.id) ?? [];
    expect(events).toContain('milestone:accounts_total:100');
    expect(events).not.toContain('milestone:accounts_total:1000');
    expect(state.live?.publishable).toEqual([]);
    expect(state.published).toHaveLength(1);
  });
  it('publishes at the threshold, fires the milestone once, and skips no-op writes', async () => {
    await refreshProofStats(T0);
    state.counts.accounts_total = 1004;
    await refreshProofStats(at(1));
    expect(state.live?.publishable).toEqual(['accounts_total']);
    const types = state.live?.events.map(
      e => `${e.type}:${e.statId}:${e.value}`
    );
    expect(types).toContain('milestone:accounts_total:1000');
    expect(types).toContain('published:accounts_total:1004');
    const writes = state.versions.length;
    await refreshProofStats(at(2));
    expect(state.versions.length).toBe(writes);
    const ids = state.live?.events.map(e => e.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    const resolved = await getPublicProofStats(
      ['accounts_total', 'nope'],
      at(2)
    );
    expect(resolved.accounts_total?.sentence).toBe(
      'Trusted by 1k+ artists and teams'
    );
    expect(resolved.nope).toBeUndefined();
    expect((await getPublicProofStat('accounts_total', at(2)))?.value).toBe(
      '1k+'
    );
    expect(await getPublicProofStat('nope', at(2))).toBeNull();
  });
  it('withdraws a stat whose producer stopped and expires the cached page', async () => {
    state.counts.accounts_total = 5000;
    await refreshProofStats(T0);
    expect(state.live?.publishable).toContain('accounts_total');
    // Producer dies: every measurement fails for longer than the SLA.
    state.counts = {
      accounts_total: new Error('db down'),
      artists_claimed: new Error('db down'),
      smart_links_total: new Error('db down'),
      release_alerts_delivered: new Error('db down'),
    };
    const result = await refreshProofStats(at(30));
    expect(result.failed).toHaveLength(4);
    expect(result.written).toBe(true);
    expect(state.live?.publishable).toEqual([]);
    const withdrawn = state.live?.events.find(e => e.type === 'withdrawn');
    expect(withdrawn).toMatchObject({
      statId: 'accounts_total',
      reason: 'stale',
    });
  });
  it('carries an approval only while the value is unchanged', async () => {
    const approval = { cardId: 'card_abc', approvedAt: T0.toISOString() };
    const base = {
      measuredAt: T0.toISOString(),
      source: 'workflow:public-benchmark',
      receipt: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    };
    const record = (value: number, hours: number, approved = false) => {
      const observation = {
        ...base,
        value,
        measuredAt: at(hours).toISOString(),
        ...(approved ? { approval } : {}),
      };
      return recordProofObservations(
        [{ id: 'profile_lcp_rank', observation }],
        {
          actor: 'agent:summer',
          reason: 'bench',
          now: at(hours),
        }
      );
    };
    await record(2, 0, true);
    await record(2, 168);
    expect(state.live?.observations.profile_lcp_rank?.approval?.cardId).toBe(
      'card_abc'
    );
    // Measuring stat: approved and fresh, but not live yet, so no chart.
    expect(
      await getPublicProofComparison('profile_lcp_rank', at(168))
    ).toBeNull();
    expect(
      await getPublicProofComparison('accounts_total', at(168))
    ).toBeNull();
    await record(1, 336);
    expect(state.live?.observations.profile_lcp_rank?.approval).toBeNull();
  });
});
