import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSubscriptionsList, mockCreatePortalSession } = vi.hoisted(() => ({
  mockSubscriptionsList: vi.fn(),
  mockCreatePortalSession: vi.fn(),
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' },
}));

vi.mock('@/lib/stripe/client', () => ({
  createBillingPortalSession: mockCreatePortalSession,
  stripe: {
    subscriptions: {
      list: mockSubscriptionsList,
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
    price_max_monthly: {
      priceId: 'price_max_monthly',
      plan: 'max',
    },
  },
}));

import {
  checkExistingPlanSubscription,
  getCheckoutErrorResponse,
} from '@/lib/stripe/checkout-helpers';

function sub(status: string, priceId: string) {
  return { status, items: { data: [{ price: { id: priceId } }] } };
}

describe('checkout-helpers', () => {
  describe('checkExistingPlanSubscription (double-subscription guard)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockCreatePortalSession.mockResolvedValue({
        id: 'bps_123',
        url: 'https://billing.stripe.com/portal',
      });
    });

    it('allows checkout when the customer has no active subscription', async () => {
      mockSubscriptionsList.mockResolvedValue({
        data: [sub('canceled', 'price_pro_monthly')],
      });

      const result = await checkExistingPlanSubscription('cus_1', 'max');

      expect(result).toEqual({ alreadySubscribed: false });
      expect(mockCreatePortalSession).not.toHaveBeenCalled();
    });

    it('routes a same-plan active subscriber to the portal (manage current plan)', async () => {
      mockSubscriptionsList.mockResolvedValue({
        data: [sub('active', 'price_pro_monthly')],
      });

      const result = await checkExistingPlanSubscription('cus_1', 'pro');

      expect(result).toMatchObject({
        alreadySubscribed: true,
        planChangeRequired: false,
      });
      expect(mockCreatePortalSession).toHaveBeenCalledTimes(1);
    });

    it('does NOT create a second subscription when an active DIFFERENT-plan sub exists (Pro → Max)', async () => {
      // Regression for JOV-4196: a Pro subscriber checking out Max previously
      // fell through to a brand-new second subscription = double billing.
      mockSubscriptionsList.mockResolvedValue({
        data: [sub('active', 'price_pro_monthly')],
      });

      const result = await checkExistingPlanSubscription('cus_1', 'max');

      expect(result).toMatchObject({
        alreadySubscribed: true,
        planChangeRequired: true,
      });
      expect(mockCreatePortalSession).toHaveBeenCalledTimes(1);
    });

    it('treats trialing/past_due/unpaid as active blockers', async () => {
      for (const status of ['trialing', 'past_due', 'unpaid']) {
        mockSubscriptionsList.mockResolvedValue({
          data: [sub(status, 'price_pro_monthly')],
        });
        const result = await checkExistingPlanSubscription('cus_1', 'max');
        expect(result).toMatchObject({ alreadySubscribed: true });
      }
    });
  });

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
