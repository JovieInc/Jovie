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
    mockUpdateUserBillingStatus.mockReset();
    mockUpdateUserBillingStatus.mockResolvedValue({ success: true });
  });
  it('uses the app user id when clerk id is null', async () => {
    const { fixStatusMismatch } = await import(
      '@/lib/billing/reconciliation/status-mismatch-fixer'
    );
    const { handleOrphanedSubscription } = await import(
      '@/lib/billing/reconciliation/orphaned-subscription-handler'
    );
    const user = {
      id: 'user-uuid',
      clerkId: null,
      isPro: false,
      stripeSubscriptionId: 'sub_missing',
    };
    await expect(
      fixStatusMismatch(user, subscription, true)
    ).resolves.toMatchObject({ success: true });
    await expect(
      handleOrphanedSubscription({} as never, { ...user, isPro: true })
    ).resolves.toEqual({ success: true, action: 'downgraded' });
    expect(mockUpdateUserBillingStatus).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        clerkUserId: 'user-uuid',
        isPro: true,
        source: 'reconciliation',
      })
    );
    expect(mockUpdateUserBillingStatus).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        clerkUserId: 'user-uuid',
        isPro: false,
        stripeSubscriptionId: null,
        source: 'reconciliation',
      })
    );
  });
});
