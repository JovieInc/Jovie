import { describe, expect, it, vi } from 'vitest';

const mockUpdateUserBillingStatus = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateUserBillingStatus,
}));

import type Stripe from 'stripe';
import { fixStatusMismatch } from '@/lib/billing/reconciliation/status-mismatch-fixer';

describe('status-mismatch-fixer', () => {
  const mockUser = {
    id: 'user_1',
    clerkId: 'clerk_1',
    isPro: true,
  };

  const makeSubscription = (
    id: string,
    status: Stripe.Subscription.Status,
    customer: string
  ) =>
    ({
      id,
      status,
      customer,
    }) as Stripe.Subscription;

  it('should fix mismatch by downgrading user when expected is false', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });

    const subscription = makeSubscription('sub_1', 'canceled', 'cus_1');
    const result = await fixStatusMismatch(mockUser, subscription, false);

    expect(result.success).toBe(true);
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'clerk_1',
        isPro: false,
        stripeSubscriptionId: null,
        stripeCustomerId: 'cus_1',
        eventType: 'reconciliation_fix',
        source: 'reconciliation',
      })
    );
  });

  it('should fix mismatch by upgrading user when expected is true', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });

    const user = { ...mockUser, isPro: false };
    const subscription = makeSubscription('sub_2', 'active', 'cus_2');
    const result = await fixStatusMismatch(user, subscription, true);

    expect(result.success).toBe(true);
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'clerk_1',
        isPro: true,
        stripeSubscriptionId: 'sub_2',
        stripeCustomerId: 'cus_2',
      })
    );
  });

  it('should return error when updateUserBillingStatus fails', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({
      success: false,
      error: 'DB constraint violation',
    });

    const subscription = makeSubscription('sub_3', 'canceled', 'cus_3');
    const result = await fixStatusMismatch(mockUser, subscription, false);

    expect(result.success).toBe(false);
    expect(result.error).toBe('DB constraint violation');
  });

  it('should include metadata with reason and current state', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });

    const subscription = makeSubscription('sub_4', 'past_due', 'cus_4');
    await fixStatusMismatch(mockUser, subscription, false);

    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          reason: 'status_mismatch',
          dbIsPro: true,
          stripeStatus: 'past_due',
          expectedIsPro: false,
        }),
      })
    );
  });

  it('should handle expanded customer object in subscription', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });

    const subscription = {
      id: 'sub_5',
      status: 'active',
      customer: { id: 'cus_expanded' },
    } as unknown as Stripe.Subscription;

    const user = { ...mockUser, isPro: false };
    await fixStatusMismatch(user, subscription, true);

    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeCustomerId: 'cus_expanded',
      })
    );
  });
});
