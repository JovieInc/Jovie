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
  PRICE_MAPPINGS: {
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

import { isIntervalChange, isPlanUpgrade } from '@/lib/stripe/plan-change';

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
});
