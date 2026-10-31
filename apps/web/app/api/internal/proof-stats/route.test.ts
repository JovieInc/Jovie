import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  writer: { ok: true, actor: 'agent:summer' } as
    | { ok: true; actor: string }
    | { ok: false; status: 401; error: string },
  card: null as null | { status: string; resolution: string | null },
  recorded: [] as unknown[],
}));
vi.mock('@/lib/content-records/access.server', () => ({
  resolveContentWriter: vi.fn(async () => state.writer),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/ovie/summer-cards.server', () => ({
  getSummerCard: vi.fn(async () => state.card),
}));
vi.mock('@/lib/proof-stats/publish.server', () => ({
  getProofStatsRecord: vi.fn(async () => ({
    versionId: 'v1',
    record: { schemaVersion: 1, observations: {}, publishable: [], events: [] },
  })),
  recordProofObservations: vi.fn(async (updates: unknown) => {
    state.recorded.push(updates);
    return { written: true, versionId: 'v2', changed: [], events: [] };
  }),
}));
const { GET, POST } = await import('./route');
const NOW = new Date().toISOString();
const receipt = 'https://github.com/JovieInc/Jovie/actions/runs/40572281306';
function post(body: unknown) {
  return POST(
    new Request('https://jov.ie/api/internal/proof-stats', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
}
function obs(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    observation: {
      value: 63.1,
      measuredAt: NOW,
      source: 'workflow:public-benchmark',
      receipt,
      ...extra,
    },
  };
}
describe('/api/internal/proof-stats', () => {
  beforeEach(() => {
    state.writer = { ok: true, actor: 'agent:summer' };
    state.card = null;
    state.recorded = [];
  });
  it('rejects callers without the content writer credential', async () => {
    state.writer = { ok: false, status: 401, error: 'Unauthorized' };
    expect((await GET(new Request('https://jov.ie/x'))).status).toBe(401);
    expect((await post({})).status).toBe(401);
  });
  it('serves the feed with metrics and every registered stat', async () => {
    const response = await GET(new Request('https://jov.ie/x'));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.metrics.published).toBe(0);
    expect(
      body.stats.find((s: { id: string }) => s.id === 'accounts_total')
    ).toMatchObject({ state: 'missing', visibility: 'public' });
  });
  it('records a benchmark observation with a receipt', async () => {
    const response = await post({
      reason: 'weekly benchmark',
      observations: [obs('profile_ttfb_ms')],
    });
    expect(response.status).toBe(200);
    expect(state.recorded).toHaveLength(1);
  });
  it('refuses production counts, receipt-less benchmarks and unknown stats', async () => {
    const response = await post({
      reason: 'try to type a number',
      observations: [
        obs('accounts_total', { source: 'agent:summer', receipt: null }),
        obs('profile_ttfb_ms', { receipt: null }),
        obs('made_up_stat'),
      ],
    });
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.errors).toEqual([
      'accounts_total: production stats are measured by the hourly refresh',
      'profile_ttfb_ms: benchmark observations need the run receipt URL',
      'made_up_stat: not in the registry',
    ]);
    expect(state.recorded).toHaveLength(0);
  });
  it('accepts an approval only from a founder-approved card', async () => {
    const approval = { cardId: 'card_lcp_1', approvedAt: NOW };
    state.card = { status: 'approved', resolution: 'default' };
    let response = await post({
      reason: 'comparative',
      observations: [obs('profile_lcp_rank', { value: 2, approval })],
    });
    expect(response.status).toBe(422);
    state.card = { status: 'approved', resolution: 'founder' };
    response = await post({
      reason: 'comparative',
      observations: [obs('profile_lcp_rank', { value: 2, approval })],
    });
    expect(response.status).toBe(200);
  });
  it('rejects malformed bodies', async () => {
    const bad = await POST(
      new Request('https://jov.ie/x', { method: 'POST', body: '{' })
    );
    expect(bad.status).toBe(400);
    expect((await post({ reason: 'x', observations: [] })).status).toBe(400);
  });
});
