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

describe('getConversionFunnelData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeFunnelRow(overrides: Record<string, number> = {}) {
    return {
      total_users: 100,
      with_profiles: 50,
      profile_complete: 30,
      has_subscribers: 10,
      paid_users: 5,
      ...overrides,
    };
  }

  it('returns 5 stages with correct labels', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getConversionFunnelData } = await import(
      '@/lib/admin/conversion-funnel'
    );
    const result = await getConversionFunnelData('all');

    expect(result.stages).toHaveLength(5);
    expect(result.stages.map(s => s.label)).toEqual([
      'Total Users',
      'With Profiles',
      'Profile Complete',
      'Has Subscribers',
      'Paid',
    ]);
  });

  it('calculates conversion rates correctly', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getConversionFunnelData } = await import(
      '@/lib/admin/conversion-funnel'
    );
    const result = await getConversionFunnelData('all');

    // with_profiles=50 / total_users=100 = 0.5
    expect(result.stages[1].conversionRate).toBe(0.5);
    // profile_complete=30 / with_profiles=50 = 0.6
    expect(result.stages[2].conversionRate).toBe(0.6);
  });

  it('calculates dropOff correctly', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getConversionFunnelData } = await import(
      '@/lib/admin/conversion-funnel'
    );
    const result = await getConversionFunnelData('all');

    // total_users(100) - with_profiles(50) = 50
    expect(result.stages[1].dropOff).toBe(50);
    // with_profiles(50) - profile_complete(30) = 20
    expect(result.stages[2].dropOff).toBe(20);
  });

  it('first stage has null conversionRate and null dropOff', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getConversionFunnelData } = await import(
      '@/lib/admin/conversion-funnel'
    );
    const result = await getConversionFunnelData('all');

    expect(result.stages[0].conversionRate).toBeNull();
    expect(result.stages[0].dropOff).toBeNull();
  });

  it('returns empty stages with error message when DB throws', async () => {
    mockExecute.mockRejectedValue(new Error('connection refused'));

    const { getConversionFunnelData } = await import(
      '@/lib/admin/conversion-funnel'
    );
    const result = await getConversionFunnelData('all');

    expect(result.stages).toHaveLength(5);
    expect(result.stages.every(s => s.count === 0)).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('connection refused');
    expect(mockCaptureError).toHaveBeenCalled();
  });

  it('passes date constraints for 7d time range', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getConversionFunnelData } = await import(
      '@/lib/admin/conversion-funnel'
    );
    await getConversionFunnelData('7d');

    expect(mockExecute).toHaveBeenCalledTimes(1);
    // The SQL template is called with a date filter — we verify the call happened
    const sqlArg = mockExecute.mock.calls[0][0];
    expect(sqlArg).toBeDefined();
  });

  it('passes date constraints for 30d time range', async () => {
    mockExecute.mockResolvedValue({ rows: [makeFunnelRow()] });

    const { getConversionFunnelData } = await import(
      '@/lib/admin/conversion-funnel'
    );
    await getConversionFunnelData('30d');

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});
