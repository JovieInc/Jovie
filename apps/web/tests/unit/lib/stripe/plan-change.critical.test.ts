/**
 * Plan Change Tests
 *
 * Tests for plan upgrade/downgrade operations including proration preview,
 * execution, scheduled change cancellation, and available plan discovery.
 */

import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks - must be defined before vi.mock calls
const {
  mockStripeSubscriptions,
  mockStripeInvoices,
  mockStripeSubscriptionSchedules,
  mockCaptureError,
  mockGetActivePriceIds,
  mockGetPriceMappingDetails,
  mockPriceMappings,
} = vi.hoisted(() => ({
  mockStripeSubscriptions: {
    list: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
  },
  mockStripeInvoices: {
    createPreview: vi.fn(),
  },
  mockStripeSubscriptionSchedules: {
    list: vi.fn(),
    cancel: vi.fn(),
    release: vi.fn(),
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
  get PRICE_MAPPINGS() {
    return mockPriceMappings;
  },
}));

// Import after mocks are set up
import {
  cancelScheduledPlanChange,
  executePlanChange,
  getActiveSubscription,
  getAvailablePlanChanges,
  isIntervalChange,
  isPlanUpgrade,
  previewPlanChange,
} from '@/lib/stripe/plan-change';

// --- Test data factories ---

const PRICE_PRO_MONTHLY = 'price_pro_monthly';
const PRICE_PRO_YEARLY = 'price_pro_yearly';
const PRICE_MAX_MONTHLY = 'price_max_monthly';
const PRICE_MAX_YEARLY = 'price_max_yearly';

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
  [PRICE_MAX_MONTHLY]: {
    priceId: PRICE_MAX_MONTHLY,
    plan: 'max',
    amount: 20000,
    currency: 'usd',
    interval: 'month',
    description: 'Max Monthly',
  },
  [PRICE_MAX_YEARLY]: {
    priceId: PRICE_MAX_YEARLY,
    plan: 'max',
    amount: 192000,
    currency: 'usd',
    interval: 'year',
    description: 'Max Yearly',
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

// --- Tests ---

describe('@critical plan-change.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default config mocks
    mockGetActivePriceIds.mockReturnValue([
      PRICE_PRO_MONTHLY,
      PRICE_PRO_YEARLY,
      PRICE_MAX_MONTHLY,
      PRICE_MAX_YEARLY,
    ]);
    mockGetPriceMappingDetails.mockImplementation(
      (priceId: string) => priceMappingsData[priceId] || null
    );

    // Populate PRICE_MAPPINGS object
    Object.keys(mockPriceMappings).forEach(
      k => delete (mockPriceMappings as Record<string, unknown>)[k]
    );
    Object.assign(mockPriceMappings, priceMappingsData);
  });

  // -------------------------------------------------------
  // getActiveSubscription
  // -------------------------------------------------------
  describe('getActiveSubscription()', () => {
    it('returns the active subscription for a customer', async () => {
      const sub = makeSubscription();
      mockStripeSubscriptions.list.mockResolvedValue({ data: [sub] });

      const result = await getActiveSubscription('cus_abc');

      expect(result).toBeTruthy();
      expect(result!.id).toBe('sub_123');
      expect(mockStripeSubscriptions.list).toHaveBeenCalledWith({
        customer: 'cus_abc',
        status: 'active',
        limit: 1,
        expand: ['data.items.data.price'],
      });
    });

    it('returns null when no active subscription exists', async () => {
      mockStripeSubscriptions.list.mockResolvedValue({ data: [] });

      const result = await getActiveSubscription('cus_none');

      expect(result).toBeNull();
    });

    it('returns null and captures error on Stripe API failure', async () => {
      mockStripeSubscriptions.list.mockRejectedValue(
        new Error('Stripe network error')
      );

      const result = await getActiveSubscription('cus_err');

      expect(result).toBeNull();
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Error fetching active subscription',
        expect.any(Error),
        { customerId: 'cus_err' }
      );
    });
  });

  // -------------------------------------------------------
  // isPlanUpgrade
  // -------------------------------------------------------
  describe('isPlanUpgrade()', () => {
    it('returns true for free -> pro', () => {
      expect(isPlanUpgrade('free', 'pro')).toBe(true);
    });

    it('returns true for free -> max', () => {
      expect(isPlanUpgrade('free', 'max')).toBe(true);
    });

    it('returns true for pro -> max', () => {
      expect(isPlanUpgrade('pro', 'max')).toBe(true);
    });

    it('returns false for max -> pro (downgrade)', () => {
      expect(isPlanUpgrade('max', 'pro')).toBe(false);
    });

    it('returns false for pro -> free (downgrade)', () => {
      expect(isPlanUpgrade('pro', 'free')).toBe(false);
    });

    it('returns false for same plan', () => {
      expect(isPlanUpgrade('pro', 'pro')).toBe(false);
    });
  });

  // -------------------------------------------------------
  // isIntervalChange
  // -------------------------------------------------------
  describe('isIntervalChange()', () => {
    it('returns true for monthly to yearly', () => {
      expect(isIntervalChange('month', 'year')).toBe(true);
    });

    it('returns true for yearly to monthly', () => {
      expect(isIntervalChange('year', 'month')).toBe(true);
    });

    it('returns false for same interval (month)', () => {
      expect(isIntervalChange('month', 'month')).toBe(false);
    });

    it('returns false for same interval (year)', () => {
      expect(isIntervalChange('year', 'year')).toBe(false);
    });
  });

  // -------------------------------------------------------
  // previewPlanChange
  // -------------------------------------------------------
  describe('previewPlanChange()', () => {
    it('returns a proration preview for an upgrade', async () => {
      const sub = makeSubscription();
      mockStripeSubscriptions.list.mockResolvedValue({ data: [sub] });
      mockStripeInvoices.createPreview.mockResolvedValue({
        amount_due: 6000,
        currency: 'usd',
        lines: {
          data: [
            {
              description: 'Remaining time on Max Monthly',
              amount: 6000,
              quantity: 1,
            },
          ],
        },
      });

      const result = await previewPlanChange({
        customerId: 'cus_abc',
        newPriceId: PRICE_MAX_MONTHLY,
      });

      expect(result).toBeTruthy();
      expect(result!.isUpgrade).toBe(true);
      expect(result!.immediateAmount).toBe(6000);
      expect(result!.currency).toBe('usd');
      expect(result!.currentPlan.priceId).toBe(PRICE_PRO_MONTHLY);
      expect(result!.newPlan.priceId).toBe(PRICE_MAX_MONTHLY);
      expect(result!.lineItems).toHaveLength(1);
      expect(result!.description).toContain('Upgrade');
    });

    it('returns a proration preview for a downgrade with zero immediate amount', async () => {
      const sub = makeSubscription({
        items: {
          data: [{ id: 'si_item_1', price: { id: PRICE_MAX_MONTHLY } }],
        },
      });
      mockStripeSubscriptions.list.mockResolvedValue({ data: [sub] });
      mockStripeInvoices.createPreview.mockResolvedValue({
        amount_due: 0,
        currency: 'usd',
        lines: { data: [] },
      });

      const result = await previewPlanChange({
        customerId: 'cus_abc',
        newPriceId: PRICE_PRO_MONTHLY,
      });

      expect(result).toBeTruthy();
      expect(result!.isUpgrade).toBe(false);
      expect(result!.immediateAmount).toBe(0);
      expect(result!.description).toContain('Downgrade');
    });

    it('returns null for an invalid price ID', async () => {
      mockGetActivePriceIds.mockReturnValue([PRICE_PRO_MONTHLY]);

      const result = await previewPlanChange({
        customerId: 'cus_abc',
        newPriceId: 'price_invalid',
      });

      expect(result).toBeNull();
    });

    it('returns null when customer has no active subscription', async () => {
      mockStripeSubscriptions.list.mockResolvedValue({ data: [] });

      const result = await previewPlanChange({
        customerId: 'cus_none',
        newPriceId: PRICE_MAX_MONTHLY,
      });

      expect(result).toBeNull();
    });

    it('returns null and captures error on Stripe API failure', async () => {
      const sub = makeSubscription();
      mockStripeSubscriptions.list.mockResolvedValue({ data: [sub] });
      mockStripeInvoices.createPreview.mockRejectedValue(
        new Error('Invoice preview failed')
      );

      const result = await previewPlanChange({
        customerId: 'cus_abc',
        newPriceId: PRICE_MAX_MONTHLY,
      });

      expect(result).toBeNull();
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Error previewing plan change',
        expect.any(Error),
        { customerId: 'cus_abc', newPriceId: PRICE_MAX_MONTHLY }
      );
    });
  });

  // -------------------------------------------------------
  // executePlanChange
  // -------------------------------------------------------
  describe('executePlanChange()', () => {
    it('executes an upgrade with immediate proration', async () => {
      const sub = makeSubscription();
      mockStripeSubscriptions.retrieve.mockResolvedValue(sub);
      const updatedSub = makeSubscription({ id: 'sub_updated' });
      mockStripeSubscriptions.update.mockResolvedValue(updatedSub);

      const result = await executePlanChange({
        subscriptionId: 'sub_123',
        newPriceId: PRICE_MAX_MONTHLY,
      });

      expect(result.success).toBe(true);
      expect(result.subscription).toBeTruthy();
      // pro -> max is an upgrade, not a scheduled change
      expect(result.isScheduledChange).toBe(false);
      expect(mockStripeSubscriptions.update).toHaveBeenCalledWith(
        'sub_123',
        expect.objectContaining({
          proration_behavior: 'create_prorations',
          items: [{ id: 'si_item_1', price: PRICE_MAX_MONTHLY }],
        })
      );
    });

    it('executes a downgrade as a scheduled change via subscription schedule', async () => {
      const sub = makeSubscription({
        items: {
          data: [{ id: 'si_item_1', price: { id: PRICE_MAX_MONTHLY } }],
        },
      });
      mockStripeSubscriptions.retrieve.mockResolvedValue(sub);
      mockStripeSubscriptionSchedules.create.mockResolvedValue({
        id: 'sub_sched_new',
      });
      mockStripeSubscriptionSchedules.retrieve.mockResolvedValue({
        id: 'sub_sched_new',
        phases: [
          {
            items: [{ price: PRICE_MAX_MONTHLY, quantity: 1 }],
            start_date: sub.current_period_start,
            end_date: sub.current_period_end,
          },
        ],
      });
      mockStripeSubscriptionSchedules.update.mockResolvedValue({});

      const result = await executePlanChange({
        subscriptionId: 'sub_123',
        newPriceId: PRICE_PRO_MONTHLY,
      });

      expect(result.success).toBe(true);
      // max -> pro is a downgrade, should be scheduled
      expect(result.isScheduledChange).toBe(true);
      // Must NOT call subscriptions.update (that would apply immediately)
      expect(mockStripeSubscriptions.update).not.toHaveBeenCalled();
      // Schedule should be created from the existing subscription
      expect(mockStripeSubscriptionSchedules.create).toHaveBeenCalledWith({
        from_subscription: 'sub_123',
      });
      // Schedule should be updated with a second phase targeting the new price
      expect(mockStripeSubscriptionSchedules.update).toHaveBeenCalledWith(
        'sub_sched_new',
        expect.objectContaining({
          end_behavior: 'release',
          phases: expect.arrayContaining([
            expect.objectContaining({
              items: expect.arrayContaining([
                expect.objectContaining({ price: PRICE_PRO_MONTHLY }),
              ]),
            }),
          ]),
        })
      );
    });

    it('reuses an existing subscription schedule when one already exists', async () => {
      const sub = makeSubscription({
        items: {
          data: [{ id: 'si_item_1', price: { id: PRICE_MAX_MONTHLY } }],
        },
        schedule: 'sub_sched_existing',
      });
      mockStripeSubscriptions.retrieve.mockResolvedValue(sub);
      mockStripeSubscriptionSchedules.retrieve.mockResolvedValue({
        id: 'sub_sched_existing',
        phases: [
          {
            items: [{ price: PRICE_MAX_MONTHLY, quantity: 1 }],
            start_date: sub.current_period_start,
            end_date: sub.current_period_end,
          },
        ],
      });
      mockStripeSubscriptionSchedules.update.mockResolvedValue({});

      const result = await executePlanChange({
        subscriptionId: 'sub_123',
        newPriceId: PRICE_PRO_MONTHLY,
      });

      expect(result.success).toBe(true);
      expect(mockStripeSubscriptionSchedules.create).not.toHaveBeenCalled();
      expect(mockStripeSubscriptionSchedules.update).toHaveBeenCalledWith(
        'sub_sched_existing',
        expect.any(Object)
      );
    });

    it('treats yearly-to-monthly same-plan as a scheduled (interval downgrade) change', async () => {
      const sub = makeSubscription({
        items: {
          data: [{ id: 'si_item_1', price: { id: PRICE_PRO_YEARLY } }],
        },
      });
      mockStripeSubscriptions.retrieve.mockResolvedValue(sub);
      mockStripeSubscriptionSchedules.create.mockResolvedValue({
        id: 'sub_sched_iv',
      });
      mockStripeSubscriptionSchedules.retrieve.mockResolvedValue({
        id: 'sub_sched_iv',
        phases: [
          {
            items: [{ price: PRICE_PRO_YEARLY, quantity: 1 }],
            start_date: sub.current_period_start,
            end_date: sub.current_period_end,
          },
        ],
      });
      mockStripeSubscriptionSchedules.update.mockResolvedValue({});

      const result = await executePlanChange({
        subscriptionId: 'sub_123',
        newPriceId: PRICE_PRO_MONTHLY,
      });

      expect(result.success).toBe(true);
      expect(result.isScheduledChange).toBe(true);
      expect(mockStripeSubscriptionSchedules.update).toHaveBeenCalled();
    });

    it('returns error for invalid price ID', async () => {
      mockGetActivePriceIds.mockReturnValue([PRICE_PRO_MONTHLY]);

      const result = await executePlanChange({
        subscriptionId: 'sub_123',
        newPriceId: 'price_invalid',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid price ID');
      expect(mockStripeSubscriptions.retrieve).not.toHaveBeenCalled();
    });

    it('returns error when subscription is not active', async () => {
      const sub = makeSubscription({ status: 'canceled' });
      mockStripeSubscriptions.retrieve.mockResolvedValue(sub);

      const result = await executePlanChange({
        subscriptionId: 'sub_123',
        newPriceId: PRICE_MAX_MONTHLY,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active subscription found');
    });

    it('returns error when already on the target plan', async () => {
      const sub = makeSubscription();
      mockStripeSubscriptions.retrieve.mockResolvedValue(sub);

      const result = await executePlanChange({
        subscriptionId: 'sub_123',
        newPriceId: PRICE_PRO_MONTHLY, // same as current
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Already on this plan');
    });

    it('returns error when subscription has no price item', async () => {
      const sub = makeSubscription({
        items: { data: [{ id: 'si_item_1', price: {} }] },
      });
      mockStripeSubscriptions.retrieve.mockResolvedValue(sub);

      const result = await executePlanChange({
        subscriptionId: 'sub_123',
        newPriceId: PRICE_MAX_MONTHLY,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Subscription has no price item');
    });

    it('respects explicit prorate=true override on downgrade', async () => {
      const sub = makeSubscription({
        items: {
          data: [{ id: 'si_item_1', price: { id: PRICE_MAX_MONTHLY } }],
        },
      });
      mockStripeSubscriptions.retrieve.mockResolvedValue(sub);
      mockStripeSubscriptionSchedules.create.mockResolvedValue({
        id: 'sub_sched_p',
      });
      mockStripeSubscriptionSchedules.retrieve.mockResolvedValue({
        id: 'sub_sched_p',
        phases: [
          {
            items: [{ price: PRICE_MAX_MONTHLY, quantity: 1 }],
            start_date: sub.current_period_start,
            end_date: sub.current_period_end,
          },
        ],
      });
      mockStripeSubscriptionSchedules.update.mockResolvedValue({});

      await executePlanChange({
        subscriptionId: 'sub_123',
        newPriceId: PRICE_PRO_MONTHLY,
        prorate: true,
      });

      // For scheduled downgrades, proration lives on the future phase.
      const call = mockStripeSubscriptionSchedules.update.mock.calls[0];
      const updatePayload = call[1] as {
        phases: Array<{ proration_behavior?: string }>;
      };
      expect(updatePayload.phases[1].proration_behavior).toBe(
        'create_prorations'
      );
    });

    it('captures error and returns failure on Stripe API error', async () => {
      const sub = makeSubscription();
      mockStripeSubscriptions.retrieve.mockResolvedValue(sub);
      mockStripeSubscriptions.update.mockRejectedValue(
        new Error('Card declined')
      );

      const result = await executePlanChange({
        subscriptionId: 'sub_123',
        newPriceId: PRICE_MAX_MONTHLY,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Card declined');
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Error executing plan change',
        expect.any(Error),
        { subscriptionId: 'sub_123', newPriceId: PRICE_MAX_MONTHLY }
      );
    });
  });

  // -------------------------------------------------------
  // cancelScheduledPlanChange
  // -------------------------------------------------------
  describe('cancelScheduledPlanChange()', () => {
    it('releases a pending subscription schedule (string ID)', async () => {
      mockStripeSubscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        schedule: 'sub_sched_abc',
      });
      mockStripeSubscriptionSchedules.retrieve.mockResolvedValue({
        id: 'sub_sched_abc',
        status: 'active',
      });
      mockStripeSubscriptionSchedules.release.mockResolvedValue({});

      const result = await cancelScheduledPlanChange('sub_123');

      expect(result.success).toBe(true);
      expect(mockStripeSubscriptionSchedules.release).toHaveBeenCalledWith(
        'sub_sched_abc'
      );
    });

    it('releases a pending subscription schedule (expanded object)', async () => {
      mockStripeSubscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        schedule: { id: 'sub_sched_expanded' },
      });
      mockStripeSubscriptionSchedules.retrieve.mockResolvedValue({
        id: 'sub_sched_expanded',
        status: 'active',
      });
      mockStripeSubscriptionSchedules.release.mockResolvedValue({});

      const result = await cancelScheduledPlanChange('sub_123');

      expect(result.success).toBe(true);
      expect(mockStripeSubscriptionSchedules.release).toHaveBeenCalledWith(
        'sub_sched_expanded'
      );
    });

    it('returns error when no schedule exists', async () => {
      mockStripeSubscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        schedule: null,
      });

      const result = await cancelScheduledPlanChange('sub_123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No scheduled change to cancel');
      expect(mockStripeSubscriptionSchedules.release).not.toHaveBeenCalled();
    });

    it('is idempotent when the schedule has already been released', async () => {
      mockStripeSubscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        schedule: 'sub_sched_abc',
      });
      mockStripeSubscriptionSchedules.retrieve.mockResolvedValue({
        id: 'sub_sched_abc',
        status: 'released',
      });

      const result = await cancelScheduledPlanChange('sub_123');

      expect(result.success).toBe(true);
      expect(mockStripeSubscriptionSchedules.release).not.toHaveBeenCalled();
    });

    it('is idempotent when the schedule has already been canceled', async () => {
      mockStripeSubscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        schedule: 'sub_sched_abc',
      });
      mockStripeSubscriptionSchedules.retrieve.mockResolvedValue({
        id: 'sub_sched_abc',
        status: 'canceled',
      });

      const result = await cancelScheduledPlanChange('sub_123');

      expect(result.success).toBe(true);
      expect(mockStripeSubscriptionSchedules.release).not.toHaveBeenCalled();
    });

    it('captures error and returns failure on Stripe API error', async () => {
      mockStripeSubscriptions.retrieve.mockRejectedValue(
        new Error('Network timeout')
      );

      const result = await cancelScheduledPlanChange('sub_123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Error cancelling scheduled plan change',
        expect.any(Error),
        { subscriptionId: 'sub_123' }
      );
    });
  });

  // -------------------------------------------------------
  // getAvailablePlanChanges
  // -------------------------------------------------------
  describe('getAvailablePlanChanges()', () => {
    it('returns all plans as upgrades when customer has no Stripe ID', async () => {
      const result = await getAvailablePlanChanges('');

      expect(result).toBeTruthy();
      expect(result!.currentPlan).toBe('free');
      expect(result!.currentPriceId).toBeNull();
      expect(result!.currentInterval).toBeNull();
      expect(result!.availableChanges.length).toBe(4);
      // All should be marked as upgrades
      expect(result!.availableChanges.every(c => c.isUpgrade)).toBe(true);
      // Should be sorted by amount ascending
      for (let i = 1; i < result!.availableChanges.length; i++) {
        expect(result!.availableChanges[i].amount).toBeGreaterThanOrEqual(
          result!.availableChanges[i - 1].amount
        );
      }
    });

    it('returns all plans as upgrades when customer has no subscription', async () => {
      mockStripeSubscriptions.list.mockResolvedValue({ data: [] });

      const result = await getAvailablePlanChanges('cus_free');

      expect(result).toBeTruthy();
      expect(result!.currentPlan).toBe('free');
      expect(result!.availableChanges.length).toBe(4);
      expect(result!.availableChanges.every(c => c.isUpgrade)).toBe(true);
    });

    it('excludes current plan and sorts upgrades first when customer has a subscription', async () => {
      const sub = makeSubscription({
        items: {
          data: [{ id: 'si_item_1', price: { id: PRICE_PRO_MONTHLY } }],
        },
      });
      mockStripeSubscriptions.list.mockResolvedValue({ data: [sub] });

      const result = await getAvailablePlanChanges('cus_pro');

      expect(result).toBeTruthy();
      expect(result!.currentPlan).toBe('pro');
      expect(result!.currentPriceId).toBe(PRICE_PRO_MONTHLY);
      expect(result!.currentInterval).toBe('month');
      // Should not include current price
      expect(
        result!.availableChanges.find(c => c.priceId === PRICE_PRO_MONTHLY)
      ).toBeUndefined();
      // Upgrades should come before non-upgrades
      const upgradeIndexes = result!.availableChanges
        .map((c, i) => (c.isUpgrade ? i : -1))
        .filter(i => i >= 0);
      const nonUpgradeIndexes = result!.availableChanges
        .map((c, i) => (!c.isUpgrade ? i : -1))
        .filter(i => i >= 0);
      if (upgradeIndexes.length > 0 && nonUpgradeIndexes.length > 0) {
        expect(Math.max(...upgradeIndexes)).toBeLessThan(
          Math.min(...nonUpgradeIndexes)
        );
      }
    });

    it('returns null when subscription has no price ID', async () => {
      const sub = makeSubscription({
        items: { data: [{ id: 'si_item_1', price: {} }] },
      });
      mockStripeSubscriptions.list.mockResolvedValue({ data: [sub] });

      const result = await getAvailablePlanChanges('cus_broken');

      expect(result).toBeNull();
    });

    it('falls back to free plan options when Stripe list call fails (error caught in getActiveSubscription)', async () => {
      mockStripeSubscriptions.list.mockRejectedValue(new Error('Rate limited'));

      const result = await getAvailablePlanChanges('cus_err');

      // getActiveSubscription catches its own error and returns null,
      // so getAvailablePlanChanges treats it as "no subscription" (free plan)
      expect(result).toBeTruthy();
      expect(result!.currentPlan).toBe('free');
      expect(result!.availableChanges.length).toBe(4);
      // The inner error is still captured by getActiveSubscription
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Error fetching active subscription',
        expect.any(Error),
        { customerId: 'cus_err' }
      );
    });

    it('returns null when price details cannot be resolved for current subscription', async () => {
      const sub = makeSubscription({
        items: {
          data: [{ id: 'si_item_1', price: { id: 'price_unknown_plan' } }],
        },
      });
      mockStripeSubscriptions.list.mockResolvedValue({ data: [sub] });
      // getPriceMappingDetails returns null for unknown price
      mockGetPriceMappingDetails.mockImplementation((priceId: string) =>
        priceId === 'price_unknown_plan'
          ? null
          : priceMappingsData[priceId] || null
      );

      const result = await getAvailablePlanChanges('cus_unknown');

      expect(result).toBeNull();
    });
  });
});
