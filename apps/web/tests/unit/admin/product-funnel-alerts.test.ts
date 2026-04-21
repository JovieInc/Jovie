import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockSendSlackMessage = vi.hoisted(() => vi.fn());
const mockGetConsecutiveSyntheticFailures = vi.hoisted(() => vi.fn());

let selectCallCount = 0;
let countRows: Array<{ eventType: string; count: number }> = [];
let currentStates: Array<Record<string, unknown>> = [];
const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);

const mockDb = {
  select: vi.fn(() => {
    selectCallCount += 1;

    if (selectCallCount === 1) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(countRows),
          }),
        }),
      };
    }

    return {
      from: vi.fn().mockResolvedValue(currentStates),
    };
  }),
  insert: vi.fn(() => ({
    values: vi.fn().mockReturnValue({
      onConflictDoUpdate: mockOnConflictDoUpdate,
    }),
  })),
};

vi.mock('@/lib/db', () => ({
  db: mockDb,
}));

vi.mock('@/lib/notifications/providers/slack', () => ({
  sendSlackMessage: mockSendSlackMessage,
}));

vi.mock('@/lib/product-funnel/events', () => ({
  getConsecutiveSyntheticFailures: mockGetConsecutiveSyntheticFailures,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

describe('evaluateProductFunnelAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectCallCount = 0;
    countRows = [];
    currentStates = [];
    mockGetConsecutiveSyntheticFailures.mockResolvedValue(0);
  });

  it('sends a Slack alert once when a rule enters alerting', async () => {
    countRows = [{ eventType: 'signup_started', count: 6 }];

    const { evaluateProductFunnelAlerts } = await import(
      '@/lib/admin/product-funnel-alerts'
    );

    const result = await evaluateProductFunnelAlerts(
      new Date('2026-04-18T12:00:00.000Z')
    );

    expect(result.triggered).toEqual(['signup_completion_stalled']);
    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
    expect(mockSendSlackMessage).toHaveBeenCalledWith({
      text: expect.stringContaining('Signup started is 6 in the last 24h'),
    });
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(4);
  });

  it('sends a recovery Slack message when a rule clears', async () => {
    countRows = [
      { eventType: 'signup_started', count: 6 },
      { eventType: 'signup_completed', count: 2 },
    ];
    currentStates = [
      {
        ruleName: 'signup_completion_stalled',
        status: 'alerting',
        lastTriggeredAt: new Date('2026-04-18T10:00:00.000Z'),
        lastRecoveredAt: null,
      },
    ];

    const { evaluateProductFunnelAlerts } = await import(
      '@/lib/admin/product-funnel-alerts'
    );

    const result = await evaluateProductFunnelAlerts(
      new Date('2026-04-18T12:00:00.000Z')
    );

    expect(result.recovered).toEqual(['signup_completion_stalled']);
    expect(mockSendSlackMessage).toHaveBeenCalledTimes(1);
    expect(mockSendSlackMessage).toHaveBeenCalledWith({
      text: '[Product Funnel] Recovered: signup_completion_stalled',
    });
  });
});
