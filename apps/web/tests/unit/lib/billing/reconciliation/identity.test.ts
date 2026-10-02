import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUpdateUserBillingStatus = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateUserBillingStatus,
}));

const subscription = {
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
} as never;

describe('billing reconciliation identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });
  });

  it('fixes a status mismatch for a Better Auth user with no clerk id', async () => {
    const { fixStatusMismatch } = await import(
      '@/lib/billing/reconciliation/status-mismatch-fixer'
    );

    const result = await fixStatusMismatch(
      { id: 'user-uuid', clerkId: null, isPro: false },
      subscription,
      true
    );

    expect(result.success).toBe(true);
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user-uuid',
        isPro: true,
        source: 'reconciliation',
      })
    );
  });

  it('downgrades an orphaned Pro user by app id when clerk id is null', async () => {
    const { handleOrphanedSubscription } = await import(
      '@/lib/billing/reconciliation/orphaned-subscription-handler'
    );

    const result = await handleOrphanedSubscription({} as never, {
      id: 'user-uuid',
      clerkId: null,
      isPro: true,
      stripeSubscriptionId: 'sub_missing',
    });

    expect(result).toEqual({ success: true, action: 'downgraded' });
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user-uuid',
        isPro: false,
        stripeSubscriptionId: null,
        source: 'reconciliation',
      })
    );
  });
});
