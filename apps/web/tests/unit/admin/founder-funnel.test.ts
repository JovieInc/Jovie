import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockExecute = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: { execute: mockExecute },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

describe('getFounderFunnelData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeFunnelRow(overrides: Record<string, number> = {}) {
    return {
      onboarding_chats: 200,
      accounts_created: 100,
      profile_claimed: 60,
      onboarding_complete: 40,
      paid_users: 5,
      ...overrides,
    };
  }

  it('returns 5 stages with correct labels', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getFounderFunnelData } = await import('@/lib/admin/founder-funnel');
    const result = await getFounderFunnelData('30d');

    expect(result.stages).toHaveLength(5);
    expect(result.stages.map(s => s.label)).toEqual([
      'Onboarding chats',
      'Accounts created',
      'Profile claimed',
      'Onboarding complete',
      'Paid',
    ]);
  });

  it('calculates conversion rates and drop-offs correctly', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getFounderFunnelData } = await import('@/lib/admin/founder-funnel');
    const result = await getFounderFunnelData('30d');

    // accounts_created=100 / onboarding_chats=200 = 0.5
    expect(result.stages[1].conversionRate).toBe(0.5);
    expect(result.stages[1].dropOff).toBe(100);
    // profile_claimed=60 / accounts_created=100 = 0.6
    expect(result.stages[2].conversionRate).toBe(0.6);
    expect(result.stages[2].dropOff).toBe(40);
    // first stage has no prior
    expect(result.stages[0].conversionRate).toBeNull();
    expect(result.stages[0].dropOff).toBeNull();
  });

  it('flags the biggest drop-off stage', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getFounderFunnelData } = await import('@/lib/admin/founder-funnel');
    const result = await getFounderFunnelData('30d');

    // Losses: chats→accounts = 100 (biggest), accounts→claimed = 40,
    // claimed→onboarded = 20, onboarded→paid = 35
    expect(result.biggestDropOffKey).toBe('accounts_created');
  });

  it('returns null biggestDropOffKey when the funnel is empty', async () => {
    mockExecute.mockResolvedValue({
      rows: [
        makeFunnelRow({
          onboarding_chats: 0,
          accounts_created: 0,
          profile_claimed: 0,
          onboarding_complete: 0,
          paid_users: 0,
        }),
      ],
    });

    const { getFounderFunnelData } = await import('@/lib/admin/founder-funnel');
    const result = await getFounderFunnelData('all');

    expect(result.biggestDropOffKey).toBeNull();
    expect(result.stages.every(s => s.count === 0)).toBe(true);
  });

  it('returns empty stages with error message when DB throws', async () => {
    mockExecute.mockRejectedValue(new Error('connection refused'));

    const { getFounderFunnelData } = await import('@/lib/admin/founder-funnel');
    const result = await getFounderFunnelData('30d');

    expect(result.stages).toHaveLength(5);
    expect(result.stages.every(s => s.count === 0)).toBe(true);
    expect(result.biggestDropOffKey).toBeNull();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('connection refused');
    expect(mockCaptureError).toHaveBeenCalled();
  });

  it('queries once per call for each supported time range', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getFounderFunnelData } = await import('@/lib/admin/founder-funnel');
    await getFounderFunnelData('7d');
    await getFounderFunnelData('30d');
    await getFounderFunnelData('all');

    expect(mockExecute).toHaveBeenCalledTimes(3);
  });

  it('marks the anonymous chat stage non-identifiable with no drill-down', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getFounderFunnelData } = await import('@/lib/admin/founder-funnel');
    const result = await getFounderFunnelData('30d');

    const chats = result.stages[0];
    expect(chats.key).toBe('onboarding_chats');
    expect(chats.identifiable).toBe(false);
    expect(chats.drillDownHref).toBeNull();
  });

  it('encodes cohort stage and range in identifiable drill-down hrefs', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getFounderFunnelData } = await import('@/lib/admin/founder-funnel');
    const result = await getFounderFunnelData('7d');

    for (const stage of result.stages.slice(1)) {
      expect(stage.identifiable).toBe(true);
      expect(stage.drillDownHref).toContain(`funnelStage=${stage.key}`);
      expect(stage.drillDownHref).toContain('funnelRange=7d');
    }
  });

  it('reports the versioned metric definition', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getFounderFunnelData, FOUNDER_FUNNEL_DEFINITION_VERSION } =
      await import('@/lib/admin/founder-funnel');
    const result = await getFounderFunnelData('30d');

    expect(result.definitionVersion).toBe(FOUNDER_FUNNEL_DEFINITION_VERSION);
  });
});

describe('getFounderFunnelStageRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeStageRows(total = 2) {
    return {
      rows: [
        {
          id: 'u1',
          name: 'Ada',
          email: 'ada@example.fm',
          created_at: '2026-09-20T00:00:00.000Z',
          total,
        },
        {
          id: 'u2',
          name: null,
          email: 'bob@example.fm',
          created_at: '2026-09-21T00:00:00.000Z',
          total,
        },
      ],
    };
  }

  it('returns the stage population and total from one query', async () => {
    mockExecute.mockResolvedValue(makeStageRows(2));

    const { getFounderFunnelStageRows } = await import(
      '@/lib/admin/founder-funnel'
    );
    const result = await getFounderFunnelStageRows('paid', '30d');

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      id: 'u1',
      displayName: 'Ada',
      email: 'ada@example.fm',
      enteredAt: '2026-09-20T00:00:00.000Z',
    });
    expect(result.errors).toEqual([]);
  });

  it('returns zero total when the stage is empty', async () => {
    mockExecute.mockResolvedValue({ rows: [] });

    const { getFounderFunnelStageRows } = await import(
      '@/lib/admin/founder-funnel'
    );
    const result = await getFounderFunnelStageRows('accounts_created', 'all');

    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('surfaces query failures as errors, not a healthy empty list', async () => {
    mockExecute.mockRejectedValue(new Error('relation users does not exist'));

    const { getFounderFunnelStageRows } = await import(
      '@/lib/admin/founder-funnel'
    );
    const result = await getFounderFunnelStageRows('paid', '7d');

    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toContain('relation users does not exist');
    expect(mockCaptureError).toHaveBeenCalled();
  });

  it('only exposes identifiable stages', async () => {
    const { isFounderFunnelDrilldownStage } = await import(
      '@/lib/admin/founder-funnel'
    );

    expect(isFounderFunnelDrilldownStage('paid')).toBe(true);
    expect(isFounderFunnelDrilldownStage('onboarding_chats')).toBe(false);
    expect(isFounderFunnelDrilldownStage('nonsense')).toBe(false);
    expect(isFounderFunnelDrilldownStage(null)).toBe(false);
  });
});
