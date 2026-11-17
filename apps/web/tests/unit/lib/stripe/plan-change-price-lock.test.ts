/** Owned Pro locks keep working after their price leaves server mappings. */

import type Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCheckoutPrice } from '@/lib/billing/price-lock-checkout';
import type { PriceLockSnapshot } from '@/lib/billing/price-versions';

// Hoisted mocks - must be defined before vi.mock calls
const {
  mockStripePrices,
  mockStripeSubscriptions,
  mockStripeInvoices,
  mockStripeSubscriptionSchedules,
  mockCaptureError,
  mockGetActivePriceIds,
  mockGetPriceMappingDetails,
  mockPriceMappings,
} = vi.hoisted(() => ({
  mockStripePrices: { retrieve: vi.fn() },
  mockStripeSubscriptions: {
    list: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
  },
  mockStripeInvoices: {
    createPreview: vi.fn(),
  },
  mockStripeSubscriptionSchedules: {
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
  },
  mockCaptureError: vi.fn(),
  mockGetActivePriceIds: vi.fn(),
  mockGetPriceMappingDetails: vi.fn(),
  mockPriceMappings: {} as Record<string, unknown>,
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    prices: mockStripePrices,
    subscriptions: mockStripeSubscriptions,
    invoices: mockStripeInvoices,
    subscriptionSchedules: mockStripeSubscriptionSchedules,
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config with controllable values
vi.mock('@/lib/stripe/config', () => ({
  getActivePriceIds: mockGetActivePriceIds,
  getPriceMappingDetails: mockGetPriceMappingDetails,
  get ACTIVE_PRICE_MAPPINGS() {
    return mockPriceMappings;
  },
}));

// Import after mocks are set up
import { executePlanChange, previewPlanChange } from '@/lib/stripe/plan-change';

// --- Test data factories ---

const PRICE_PRO_MONTHLY = 'price_pro_monthly';
const PRICE_PRO_YEARLY = 'price_pro_yearly';

const priceMappingsData: Record<
  string,
  {
    priceId: string;
    plan: 'free' | 'pro' | 'max';
    amount: number;
    currency: string;
    interval: 'month' | 'year';
    description: string;
  }
> = {
  [PRICE_PRO_MONTHLY]: {
    priceId: PRICE_PRO_MONTHLY,
    plan: 'pro',
    amount: 2000,
    currency: 'usd',
    interval: 'month',
    description: 'Pro Monthly',
  },
  [PRICE_PRO_YEARLY]: {
    priceId: PRICE_PRO_YEARLY,
    plan: 'pro',
    amount: 19200,
    currency: 'usd',
    interval: 'year',
    description: 'Pro Yearly',
  },
};

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_123',
    status: 'active',
    current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
    current_period_start: Math.floor(Date.now() / 1000) - 86400,
    metadata: {},
    items: {
      data: [
        {
          id: 'si_item_1',
          price: { id: PRICE_PRO_MONTHLY },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

describe('@critical plan-change price lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStripePrices.retrieve.mockImplementation(async (id: string) => ({
      id,
      active: true,
      currency: priceMappingsData[id].currency,
      unit_amount: priceMappingsData[id].amount,
      type: 'recurring',
      billing_scheme: 'per_unit',
      transform_quantity: null,
      recurring: {
        interval: priceMappingsData[id].interval,
        interval_count: 1,
        usage_type: 'licensed',
      },
    }));

    // Default config mocks
    mockGetActivePriceIds.mockReturnValue([
      PRICE_PRO_MONTHLY,
      PRICE_PRO_YEARLY,
    ]);
    mockGetPriceMappingDetails.mockImplementation(
      (priceId: string) => priceMappingsData[priceId] || null
    );

    // Populate ACTIVE_PRICE_MAPPINGS object
    Object.keys(mockPriceMappings).forEach(
      k => delete (mockPriceMappings as Record<string, unknown>)[k]
    );
    Object.assign(mockPriceMappings, priceMappingsData);
  });

  describe('preserved lower Pro lock integration proof', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-11-17T08:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    function ownedLockChange(mappingRetained: boolean) {
      const oldPriceId = 'price_owned_pro_monthly_12';
      const expectation = {
        amountCents: 1200,
        currency: 'usd',
        interval: 'month' as const,
      };
      const lock: PriceLockSnapshot = {
        plan: 'pro',
        priceVersionId: 'pro-owned-12',
        currency: 'usd',
        monthlyAmountCents: 1200,
        yearlyAmountCents: null,
        stripePriceIdMonthly: oldPriceId,
        stripePriceIdYearly: null,
        source: 'signup',
        lockedAt: '2026-10-29T00:00:00.000Z',
      };
      mockGetPriceMappingDetails.mockImplementation((id: string) =>
        id === oldPriceId
          ? mappingRetained
            ? {
                priceId: id,
                plan: 'pro',
                amount: 1200,
                currency: 'usd',
                interval: 'month',
                description: 'Owned Pro monthly',
              }
            : null
          : (priceMappingsData[id] ?? null)
      );
      mockGetActivePriceIds.mockReturnValue([PRICE_PRO_MONTHLY]);
      mockStripePrices.retrieve.mockResolvedValue({
        id: oldPriceId,
        active: true,
        currency: 'usd',
        unit_amount: 1200,
        type: 'recurring',
        billing_scheme: 'per_unit',
        transform_quantity: null,
        recurring: {
          interval: 'month',
          interval_count: 1,
          usage_type: 'licensed',
        },
      });
      const subscription = makeSubscription({
        items: { data: [{ id: 'si_yearly', price: { id: PRICE_PRO_YEARLY } }] },
      });
      mockStripeSubscriptions.list.mockResolvedValue({ data: [subscription] });
      mockStripeSubscriptions.retrieve.mockResolvedValue(subscription);
      mockStripeInvoices.createPreview.mockResolvedValue({
        amount_due: 0,
        currency: 'usd',
        lines: { data: [] },
      });
      mockStripeSubscriptionSchedules.create.mockResolvedValue({
        id: 'sched_owned',
      });
      mockStripeSubscriptionSchedules.retrieve.mockResolvedValue({
        phases: [
          {
            start_date: subscription.current_period_start,
            end_date: subscription.current_period_end,
            items: [{ price: PRICE_PRO_YEARLY, quantity: 1 }],
          },
        ],
      });
      mockStripeSubscriptionSchedules.update.mockResolvedValue({
        id: 'sched_owned',
      });
      const decision = resolveCheckoutPrice({
        requestedPriceId: PRICE_PRO_MONTHLY,
        requestedMapping: priceMappingsData[PRICE_PRO_MONTHLY],
        lock,
      });
      expect(decision).toMatchObject({
        kind: 'locked',
        priceId: oldPriceId,
        expectation,
        substituted: true,
      });
      // The owned lock is lower than the requested offer (1200 < 2000); consent for a higher lock is not involved.
      expect(lock.monthlyAmountCents).toBeLessThan(
        priceMappingsData[PRICE_PRO_MONTHLY].amount
      );
      if (decision.kind !== 'locked')
        throw new Error('Fixture must resolve a locked decision');
      return { decision, oldPriceId };
    }

    it.each([true, false])(
      'previews owned lower lock when server mapping retained=%s',
      async retained => {
        const { decision, oldPriceId } = ownedLockChange(retained);
        const preview = await previewPlanChange({
          customerId: 'cus_owned',
          newPriceId: decision.priceId,
          lockedPrice: decision.expectation,
        });
        expect(mockStripePrices.retrieve).toHaveBeenCalledWith(oldPriceId);
        expect(preview).not.toBeNull();
        expect(preview?.newPlan.priceId).toBe(oldPriceId);
        expect(mockStripeInvoices.createPreview).toHaveBeenCalledWith(
          expect.objectContaining({
            subscription_details: expect.objectContaining({
              items: [{ id: 'si_yearly', price: oldPriceId }],
            }),
          })
        );
      }
    );

    it.each([true, false])(
      'schedules owned lower lock when server mapping retained=%s',
      async retained => {
        const { decision, oldPriceId } = ownedLockChange(retained);
        const result = await executePlanChange({
          subscriptionId: 'sub_123',
          newPriceId: decision.priceId,
          lockedPrice: decision.expectation,
        });
        expect(mockStripePrices.retrieve).toHaveBeenCalledWith(oldPriceId);
        expect(result).toMatchObject({
          success: true,
          isScheduledChange: true,
        });
        expect(mockStripeSubscriptionSchedules.update).toHaveBeenCalledWith(
          'sched_owned',
          expect.objectContaining({
            phases: [
              expect.objectContaining({
                items: [{ price: PRICE_PRO_YEARLY, quantity: 1 }],
              }),
              expect.objectContaining({
                items: [{ price: oldPriceId, quantity: 1 }],
              }),
            ],
          })
        );
        expect(mockStripeSubscriptions.update).not.toHaveBeenCalled();
      }
    );
    it('keeps an unmapped target without a trusted lock unavailable', async () => {
      const { decision } = ownedLockChange(false);
      expect(
        await previewPlanChange({
          customerId: 'cus_owned',
          newPriceId: decision.priceId,
        })
      ).toBeNull();
      expect(
        await executePlanChange({
          subscriptionId: 'sub_123',
          newPriceId: decision.priceId,
        })
      ).toMatchObject({ success: false, error: 'Invalid price ID' });
      expect(mockStripePrices.retrieve).not.toHaveBeenCalled();
      expect(mockStripeSubscriptions.retrieve).not.toHaveBeenCalled();
      expect(mockStripeSubscriptionSchedules.update).not.toHaveBeenCalled();
    });

    it('retains fail-closed handling for an unknown current subscription', async () => {
      const { decision } = ownedLockChange(false);
      mockGetPriceMappingDetails.mockReturnValue(null);
      expect(
        await previewPlanChange({
          customerId: 'cus_owned',
          newPriceId: decision.priceId,
          lockedPrice: decision.expectation,
        })
      ).toBeNull();
      expect(
        await executePlanChange({
          subscriptionId: 'sub_123',
          newPriceId: decision.priceId,
          lockedPrice: decision.expectation,
        })
      ).toMatchObject({
        success: false,
        error: 'Cannot determine plan details',
      });
      expect(mockStripePrices.retrieve).toHaveBeenCalledTimes(2);
      expect(mockStripeInvoices.createPreview).not.toHaveBeenCalled();
      expect(mockStripeSubscriptionSchedules.update).not.toHaveBeenCalled();
      expect(mockStripeSubscriptions.update).not.toHaveBeenCalled();
    });

    it('validates Stripe against the owned snapshot before resolving missing mappings', async () => {
      const { decision } = ownedLockChange(false);
      mockStripePrices.retrieve.mockResolvedValue({
        id: decision.priceId,
        active: true,
        currency: 'usd',
        unit_amount: 1300,
        type: 'recurring',
        billing_scheme: 'per_unit',
        transform_quantity: null,
        recurring: {
          interval: 'month',
          interval_count: 1,
          usage_type: 'licensed',
        },
      });
      expect(
        await previewPlanChange({
          customerId: 'cus_owned',
          newPriceId: decision.priceId,
          lockedPrice: decision.expectation,
        })
      ).toBeNull();
      expect(
        await executePlanChange({
          subscriptionId: 'sub_123',
          newPriceId: decision.priceId,
          lockedPrice: decision.expectation,
        })
      ).toMatchObject({
        success: false,
        error: 'Billing price does not match the published offer',
      });
      expect(mockStripeSubscriptions.list).not.toHaveBeenCalled();
      expect(mockStripeSubscriptions.retrieve).not.toHaveBeenCalled();
      expect(mockStripeSubscriptionSchedules.create).not.toHaveBeenCalled();
      expect(mockStripeSubscriptionSchedules.update).not.toHaveBeenCalled();
    });
  });
});
