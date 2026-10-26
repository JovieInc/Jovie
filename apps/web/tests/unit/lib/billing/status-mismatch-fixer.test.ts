import { describe, expect, it, vi } from 'vitest';

const mockUpdateUserBillingStatus = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/config', () => ({
  getPlanFromPriceId: (id: string) =>
    ({ price_pro: 'pro', price_max: 'max' })[id] ?? null,
}));

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

  const priceFor = (plan: 'pro' | 'max') => `price_${plan}`;

  const makeSubscription = (
    id: string,
    status: Stripe.Subscription.Status,
    customer: string,
    priceIds: string[] = [priceFor('pro')]
  ) =>
    ({
      id,
      status,
      customer,
      items: { data: priceIds.map(priceId => ({ price: { id: priceId } })) },
    }) as unknown as Stripe.Subscription;

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
        plan: 'pro',
      })
    );
  });

  it('grants the plan the price maps to, so a Max subscriber is not downgraded to Pro', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });
    const maxPrice = priceFor('max');
    // An add-on item may come first; the plan price is found on any item.
    const subscription = makeSubscription('sub_max', 'active', 'cus_m', [
      'price_unmapped_addon',
      maxPrice,
    ]);

    await fixStatusMismatch({ ...mockUser, isPro: false }, subscription, true);

    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        isPro: true,
        plan: 'max',
        stripePriceId: maxPrice,
      })
    );
  });

  it('does not grant Pro for a price it cannot map', async () => {
    mockUpdateUserBillingStatus.mockClear();
    const subscription = makeSubscription('sub_x', 'active', 'cus_x', [
      'price_unmapped',
    ]);

    const result = await fixStatusMismatch(
      { ...mockUser, isPro: false },
      subscription,
      true
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('unknown_price_id');
    expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
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
      items: { data: [{ price: { id: priceFor('pro') } }] },
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
