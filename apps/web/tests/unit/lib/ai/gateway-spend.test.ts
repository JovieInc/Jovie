import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCaptureError, mockWhere, mockSet } = vi.hoisted(() => {
  const mockWhere = vi.fn(async () => undefined);
  return {
    mockCaptureError: vi.fn(),
    mockWhere,
    mockSet: vi.fn(() => ({ where: mockWhere })),
  };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: { update: vi.fn(() => ({ set: mockSet })) },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mockCaptureError }));
vi.mock('@ai-sdk/gateway', () => ({ createGateway: vi.fn() }));

import {
  AI_GATEWAY_DAILY_SPEND_ALERT_USD,
  formatGatewaySpendNotes,
  getDailyGatewaySpend,
  recordDailyGatewaySpend,
} from '@/lib/ai/gateway-spend';

const NOW = new Date('2026-09-26T00:05:00.000Z');

function reporter(daily: {
  cost: number;
  inputTokens: number;
  model?: string;
}) {
  return vi.fn(
    async (params: {
      groupBy?: string;
      startDate: string;
      endDate: string;
    }) => {
      if (params.groupBy === 'tag') {
        return {
          results: [
            { tag: 'app:web', totalCost: daily.cost, requestCount: 10 },
            {
              tag: 'feature:jovie-chat',
              totalCost: daily.cost * 0.8,
              requestCount: 8,
            },
            {
              tag: 'feature:jovie-chat-title',
              totalCost: daily.cost * 0.2,
              requestCount: 2,
            },
          ],
        };
      }
      const monthly = params.startDate !== params.endDate;
      return {
        results: [
          {
            model: daily.model ?? 'zai/glm-5.3',
            totalCost: monthly ? daily.cost * 30 : daily.cost,
            // input_tokens excludes cached tokens; half the prompt is cached.
            inputTokens: (daily.inputTokens / 2) * 10,
            cachedInputTokens: (daily.inputTokens / 2) * 10,
            requestCount: 10,
          },
        ],
      };
    }
  );
}

describe('AI Gateway daily spend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('distinguishes missing token counts from a known zero average', async () => {
    for (const counts of [{}, { inputTokens: 0, cachedInputTokens: 0 }]) {
      const report = vi.fn(async () => ({
        results: [
          {
            model: 'zai/glm-5.3',
            totalCost: 0,
            requestCount: 10,
            ...counts,
          },
        ],
      }));
      const spend = await getDailyGatewaySpend(NOW, report);
      expect(spend.byModel[0]?.promptTokensPerRequest).toBe(
        'inputTokens' in counts ? 0 : null
      );
      expect(spend.cacheShare).toBeNull();
    }
  });

  it('reads the previous UTC day by tag and model plus a 30-day total', async () => {
    const report = reporter({ cost: 2, inputTokens: 20_000 });
    const spend = await getDailyGatewaySpend(NOW, report);

    expect(report).toHaveBeenCalledWith({
      startDate: '2026-09-25',
      endDate: '2026-09-25',
      groupBy: 'tag',
    });
    expect(report).toHaveBeenCalledWith({
      startDate: '2026-08-27',
      endDate: '2026-09-25',
      groupBy: 'model',
    });
    // Tag rows overlap, so the total comes from the model grouping.
    expect(spend.totalUsd).toBe(2);
    expect(spend.observed30dUsd).toBe(60);
    expect(spend.byModel[0]?.promptTokensPerRequest).toBe(20_000);
    expect(spend.cacheShare).toBe(0.5);
    expect(spend.alerts).toEqual([]);
    expect(formatGatewaySpendNotes(spend)).toBe(
      'Auto: 2026-09-25 $2.00 (jovie-chat $1.60, jovie-chat-title $0.40). Cache 50% of prompt tokens. Alert over $5.00/day.'
    );
  });

  it('alerts over $5/day and over 150K average prompt tokens (input + cached) per request', async () => {
    const spend = await getDailyGatewaySpend(
      NOW,
      reporter({
        cost: AI_GATEWAY_DAILY_SPEND_ALERT_USD + 1,
        inputTokens: 200_000,
      })
    );

    expect(spend.alerts).toEqual([
      'AI Gateway spend $6.00 on 2026-09-25 exceeds $5.00/day',
      'zai/glm-5.3 averaged 200000 prompt tokens/request on 2026-09-25',
    ]);
  });

  it('alerts on any openai/* or anthropic/* spend line (JOV-7119)', async () => {
    const spend = await getDailyGatewaySpend(
      NOW,
      reporter({ cost: 0.4, inputTokens: 1, model: 'openai/gpt-6-luna' })
    );

    expect(spend.alerts).toEqual([
      'banned gateway model openai/gpt-6-luna billed $0.40 across 10 requests on 2026-09-25',
    ]);
  });

  it('records the admin Costs row and raises a Sentry alert when over budget', async () => {
    await recordDailyGatewaySpend(NOW, reporter({ cost: 7, inputTokens: 2 }));

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        observed30dUsd: '210.00',
        notes: expect.stringContaining('2026-09-25 $7.00'),
        updatedAt: NOW,
      })
    );
    expect(mockWhere).toHaveBeenCalledTimes(1);
    expect(mockCaptureError).toHaveBeenCalledWith(
      'AI Gateway daily spend alert',
      expect.any(Error),
      expect.objectContaining({ alert: 'ai_gateway_daily_spend' }),
      'warning'
    );
  });

  it('does not alert under budget', async () => {
    await recordDailyGatewaySpend(NOW, reporter({ cost: 1, inputTokens: 2 }));
    expect(mockCaptureError).not.toHaveBeenCalled();
  });
});
