import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' },
}));

vi.mock('@/lib/stripe/client', () => ({
  createBillingPortalSession: vi.fn().mockResolvedValue({
    id: 'bps_123',
    url: 'https://billing.stripe.com/portal',
  }),
  stripe: {
    subscriptions: {
      list: vi.fn(),
    },
  },
}));

vi.mock('@/lib/stripe/config', () => ({
  PRICE_MAPPINGS: {
    price_pro_monthly: {
      priceId: 'price_pro_monthly',
      plan: 'pro',
    },
    price_pro_yearly: {
      priceId: 'price_pro_yearly',
      plan: 'pro',
    },
    price_growth_monthly: {
      priceId: 'price_growth_monthly',
      plan: 'growth',
    },
  },
}));

import { getCheckoutErrorResponse } from '@/lib/stripe/checkout-helpers';

describe('checkout-helpers', () => {
  describe('getCheckoutErrorResponse', () => {
    it('should return customer error for customer-related messages', () => {
      const error = new Error('Failed to create customer');
      const result = getCheckoutErrorResponse(error);
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Customer setup failed');
      expect(result!.status).toBe(500);
    });

    it('should return price error for price-related messages', () => {
      const error = new Error('Invalid price ID');
      const result = getCheckoutErrorResponse(error);
      expect(result).not.toBeNull();
      expect(result!.message).toBe('Invalid pricing configuration');
      expect(result!.status).toBe(400);
    });

    it('should return null for unknown error messages', () => {
      const error = new Error('Something completely unexpected');
      const result = getCheckoutErrorResponse(error);
      expect(result).toBeNull();
    });

    it('should match on partial keyword in error message', () => {
      const error = new Error('The customer could not be found');
      const result = getCheckoutErrorResponse(error);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(500);
    });
  });
});
