import { describe, expect, it, vi } from 'vitest';

// Mock server-only
vi.mock('server-only', () => ({}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: {
      list: vi.fn(),
      retrieve: vi.fn(),
      update: vi.fn(),
    },
    invoices: {
      createPreview: vi.fn(),
    },
    subscriptionSchedules: {
      cancel: vi.fn(),
    },
  },
}));

vi.mock('@/lib/stripe/config', () => ({
  getActivePriceIds: vi
    .fn()
    .mockReturnValue([
      'price_pro_monthly',
      'price_pro_yearly',
      'price_max_monthly',
    ]),
  getPriceMappingDetails: vi.fn().mockImplementation((priceId: string) => {
    const mapping: Record<string, any> = {
      price_pro_monthly: {
        plan: 'pro',
        interval: 'month',
        description: 'Pro Monthly',
        amount: 2000,
      },
      price_pro_yearly: {
        plan: 'pro',
        interval: 'year',
        description: 'Pro Yearly',
        amount: 19200,
      },
      price_max_monthly: {
        plan: 'max',
        interval: 'month',
        description: 'Max Monthly',
        amount: 20000,
      },
    };
    return mapping[priceId] ?? null;
  }),
  ACTIVE_PRICE_MAPPINGS: {
    price_pro_monthly: {
      priceId: 'price_pro_monthly',
      plan: 'pro',
      interval: 'month',
      amount: 2000,
      description: 'Pro Monthly',
    },
    price_pro_yearly: {
      priceId: 'price_pro_yearly',
      plan: 'pro',
      interval: 'year',
      amount: 19200,
      description: 'Pro Yearly',
    },
    price_max_monthly: {
      priceId: 'price_max_monthly',
      plan: 'max',
      interval: 'month',
      amount: 20000,
      description: 'Max Monthly',
    },
  },
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' },
}));

import { stripe } from '@/lib/stripe/client';
import {
  getActiveSubscription,
  isIntervalChange,
  isPlanUpgrade,
} from '@/lib/stripe/plan-change';

describe('plan-change', () => {
  describe('isPlanUpgrade', () => {
    it('should detect upgrade from free to pro', () => {
      expect(isPlanUpgrade('free', 'pro')).toBe(true);
    });

    it('should detect upgrade from free to max', () => {
      expect(isPlanUpgrade('free', 'max')).toBe(true);
    });

    it('should detect upgrade from pro to max', () => {
      expect(isPlanUpgrade('pro', 'max')).toBe(true);
    });

    it('should not detect upgrade for same plan', () => {
      expect(isPlanUpgrade('pro', 'pro')).toBe(false);
    });

    it('should not detect upgrade for downgrade from max to pro', () => {
      expect(isPlanUpgrade('max', 'pro')).toBe(false);
    });

    it('should not detect upgrade for downgrade from pro to free', () => {
      expect(isPlanUpgrade('pro', 'free')).toBe(false);
    });

    it('should not detect upgrade for downgrade from max to free', () => {
      expect(isPlanUpgrade('max', 'free')).toBe(false);
    });
  });

  describe('isIntervalChange', () => {
    it('should detect change from monthly to yearly', () => {
      expect(isIntervalChange('month', 'year')).toBe(true);
    });

    it('should detect change from yearly to monthly', () => {
      expect(isIntervalChange('year', 'month')).toBe(true);
    });

    it('should not detect change for same interval (month)', () => {
      expect(isIntervalChange('month', 'month')).toBe(false);
    });

    it('should not detect change for same interval (year)', () => {
      expect(isIntervalChange('year', 'year')).toBe(false);
    });
  });

  describe('getActiveSubscription', () => {
    const START = 1_790_000_000;
    const END = START + 30 * 86_400;

    it('reads the billing period from the subscription item on the dahlia API', async () => {
      // 2026-08-26.dahlia: no top-level current_period_*; items carry them.
      vi.mocked(stripe.subscriptions.list).mockResolvedValueOnce({
        data: [
          {
            id: 'sub_dahlia',
            status: 'active',
            items: {
              data: [{ current_period_start: START, current_period_end: END }],
            },
          },
        ],
      } as never);

      const sub = await getActiveSubscription('cus_1');
      expect(sub?.id).toBe('sub_dahlia');
      expect(sub?.current_period_start).toBe(START);
      expect(sub?.current_period_end).toBe(END);
    });

    it('still accepts legacy top-level period fields', async () => {
      vi.mocked(stripe.subscriptions.list).mockResolvedValueOnce({
        data: [
          {
            id: 'sub_legacy',
            status: 'active',
            current_period_start: START,
            current_period_end: END,
            items: { data: [] },
          },
        ],
      } as never);

      expect((await getActiveSubscription('cus_1'))?.current_period_end).toBe(
        END
      );
    });

    it('returns null when no period is readable anywhere', async () => {
      vi.mocked(stripe.subscriptions.list).mockResolvedValueOnce({
        data: [{ id: 'sub_none', status: 'active', items: { data: [{}] } }],
      } as never);

      expect(await getActiveSubscription('cus_1')).toBeNull();
    });
  });
});
