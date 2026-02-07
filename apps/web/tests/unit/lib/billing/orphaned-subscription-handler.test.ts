import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpdateUserBillingStatus = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateUserBillingStatus,
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ left: a, right: b })),
  sql: vi.fn(),
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: {
    id: 'id',
    billingVersion: 'billing_version',
    billingUpdatedAt: 'billing_updated_at',
    stripeSubscriptionId: 'stripe_subscription_id',
  },
}));

import { handleOrphanedSubscription } from '@/lib/billing/reconciliation/orphaned-subscription-handler';

describe('orphaned-subscription-handler', () => {
  const mockDb = {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.where.mockResolvedValue(undefined);
  });

  it('should downgrade pro user with orphaned subscription', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });

    const user = {
      id: 'user_1',
      clerkId: 'clerk_1',
      isPro: true,
      stripeSubscriptionId: 'sub_orphaned',
    };

    const result = await handleOrphanedSubscription(mockDb as any, user);

    expect(result.success).toBe(true);
    expect(result.action).toBe('downgraded');
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'clerk_1',
        isPro: false,
        stripeSubscriptionId: null,
        eventType: 'reconciliation_fix',
        source: 'reconciliation',
        metadata: expect.objectContaining({
          reason: 'subscription_not_found_in_stripe',
          previousSubscriptionId: 'sub_orphaned',
        }),
      })
    );
  });

  it('should return error when downgrade fails', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({
      success: false,
      error: 'Update failed',
    });

    const user = {
      id: 'user_2',
      clerkId: 'clerk_2',
      isPro: true,
      stripeSubscriptionId: 'sub_orphaned_2',
    };

    const result = await handleOrphanedSubscription(mockDb as any, user);

    expect(result.success).toBe(false);
    expect(result.action).toBe('downgraded');
    expect(result.error).toBe('Update failed');
  });

  it('should clear subscription ID for non-pro user', async () => {
    const user = {
      id: 'user_3',
      clerkId: 'clerk_3',
      isPro: false,
      stripeSubscriptionId: 'sub_stale',
    };

    const result = await handleOrphanedSubscription(mockDb as any, user);

    expect(result.success).toBe(true);
    expect(result.action).toBe('cleared_id');
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: null,
      })
    );
    // Should NOT call updateUserBillingStatus for non-pro users
    expect(mockUpdateUserBillingStatus).not.toHaveBeenCalled();
  });
});
