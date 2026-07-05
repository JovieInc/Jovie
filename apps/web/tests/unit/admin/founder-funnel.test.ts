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
});
