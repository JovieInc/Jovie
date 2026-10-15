import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateUserBillingStatus } from './update-status';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  capture: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@/lib/db/billing-status', () => ({
  applyBillingUpdateWithAudit: mocks.apply,
}));
vi.mock('@/lib/observability/revenue-spine', () => ({
  captureRevenueSpineFailure: mocks.capture,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
  captureWarning: vi.fn(),
}));
vi.mock('./queries', () => ({ fetchUserBillingDataByIdentity: mocks.fetch }));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const options = { clerkUserId: 'user_legacy_provider_id', isPro: true };
const user = {
  id: USER_ID,
  billingVersion: 1,
  isPro: false,
  plan: 'free',
  lastBillingEventAt: null,
};

describe('billing synchronization failure reporting', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    mocks.fetch.mockResolvedValue({ success: true, data: user });
    mocks.apply.mockResolvedValue({ appUserId: USER_ID });
  });
  afterEach(() => vi.useRealTimers());

  it('reports an unavailable billing read without provider identifiers', async () => {
    mocks.fetch.mockResolvedValue({ success: false });
    expect((await updateUserBillingStatus(options)).success).toBe(false);
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith({
      stage: 'stripe_sync',
      failureCode: 'billing_unavailable',
      severity: 'blocked',
      userId: options.clerkUserId,
    });
  });

  it.each([false, true])(
    'reports a failed write with the resolved app identity (retry=%s)',
    async retry => {
      const error = Object.assign(new Error('private database detail'), {
        code: '42501',
      });
      if (retry) mocks.apply.mockResolvedValueOnce(null);
      mocks.apply.mockRejectedValueOnce(error);
      expect((await updateUserBillingStatus(options)).success).toBe(false);
      expect(mocks.capture).toHaveBeenCalledExactlyOnceWith({
        stage: 'stripe_sync',
        severity: 'blocked',
        userId: USER_ID,
        error,
      });
    }
  );

  it('reports a failed retry read exactly once', async () => {
    mocks.apply.mockResolvedValueOnce(null);
    mocks.fetch
      .mockResolvedValueOnce({ success: true, data: user })
      .mockResolvedValueOnce({ success: false });
    expect((await updateUserBillingStatus(options)).success).toBe(false);
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith({
      stage: 'stripe_sync',
      failureCode: 'billing_unavailable',
      severity: 'blocked',
      userId: USER_ID,
    });
  });

  it('reports exhausted concurrency retries once, with no provider IDs in the contract', async () => {
    mocks.apply.mockResolvedValue(null);
    const result = updateUserBillingStatus(options);
    await vi.runAllTimersAsync();
    expect((await result).success).toBe(false);
    expect(mocks.capture).toHaveBeenCalledExactlyOnceWith({
      stage: 'stripe_sync',
      failureCode: 'concurrent_update',
      severity: 'blocked',
      userId: USER_ID,
    });
  });

  it('does not report successful or stale deliveries as failures', async () => {
    expect((await updateUserBillingStatus(options)).success).toBe(true);
    mocks.fetch.mockResolvedValue({
      success: true,
      data: { ...user, lastBillingEventAt: new Date('2026-10-15') },
    });
    expect(
      await updateUserBillingStatus({
        ...options,
        stripeEventTimestamp: new Date('2026-10-14'),
      })
    ).toMatchObject({ success: true, skipped: true });
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
