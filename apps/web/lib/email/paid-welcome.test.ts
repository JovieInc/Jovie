import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';

const {
  mockInsert,
  mockUpdate,
  mockSelect,
  mockSendEmail,
  mockLogDelivery,
  mockGetFlagOverrideMap,
  mockGetPriceMappingDetails,
} = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockSelect: vi.fn(),
  mockSendEmail: vi.fn(),
  mockLogDelivery: vi.fn(),
  mockGetFlagOverrideMap: vi.fn(),
  mockGetPriceMappingDetails: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'id', email: 'email', name: 'name' },
}));

vi.mock('@/lib/db/schema/ingestion', () => ({
  ingestionJobs: {
    id: 'id',
    dedupKey: 'dedup_key',
    status: 'status',
    updatedAt: 'updated_at',
    attempts: 'attempts',
  },
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: mockSendEmail,
}));

vi.mock('@/lib/notifications/suppression', () => ({
  logDelivery: mockLogDelivery,
}));

vi.mock('@/lib/flags/overrides-store.server', () => ({
  getFlagOverrideMap: mockGetFlagOverrideMap,
}));

vi.mock('@/lib/stripe/config', () => ({
  getPriceMappingDetails: mockGetPriceMappingDetails,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  buildPaidWelcomeDedupKey,
  isPaidSubscriptionStatus,
  maybeSendPaidWelcomeAfterEntitlement,
} from './paid-welcome';

function subscription(
  overrides: Partial<Stripe.Subscription> = {}
): Stripe.Subscription {
  return {
    id: 'sub_paid_1',
    status: 'active',
    items: { data: [{ price: { id: 'price_pro' } }] },
    ...overrides,
  } as Stripe.Subscription;
}

function mockInsertChain() {
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    }),
  });
}

function mockClaimReturning(row: { id: string } | null) {
  mockUpdate.mockReturnValueOnce({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(row ? [row] : []),
      }),
    }),
  });
}

function mockMarkJob() {
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
}

function mockUserSelect(user: { email: string; name: string | null } | null) {
  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(user ? [user] : []),
      }),
    }),
  });
}

describe('paid welcome email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFlagOverrideMap.mockResolvedValue({});
    mockGetPriceMappingDetails.mockReturnValue({ description: 'Pro' });
    mockSendEmail.mockResolvedValue({ success: true, messageId: 'msg_1' });
    mockLogDelivery.mockResolvedValue(undefined);
    mockInsertChain();
  });

  it('builds a subscription-scoped dedup key', () => {
    expect(buildPaidWelcomeDedupKey('sub_abc')).toBe(
      'send_paid_welcome:sub_abc'
    );
  });

  it('treats only active subscriptions as paid', () => {
    expect(isPaidSubscriptionStatus('active')).toBe(true);
    expect(isPaidSubscriptionStatus('trialing')).toBe(false);
    expect(isPaidSubscriptionStatus('incomplete')).toBe(false);
  });

  it('does not send when the feature flag is off', async () => {
    const result = await maybeSendPaidWelcomeAfterEntitlement({
      appUserId: 'user-1',
      clerkUserId: 'clerk_1',
      subscription: subscription(),
      plan: 'pro',
    });

    expect(result).toEqual({ status: 'skipped', reason: 'flag_off' });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('skips trialing subscriptions even when the flag is on', async () => {
    mockGetFlagOverrideMap.mockResolvedValue({ PAID_WELCOME_EMAIL: true });

    const result = await maybeSendPaidWelcomeAfterEntitlement({
      appUserId: 'user-1',
      clerkUserId: 'clerk_1',
      subscription: subscription({ status: 'trialing' }),
      plan: 'pro',
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'subscription_status_trialing',
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('sends once when the flag is on and records a delivery receipt', async () => {
    mockGetFlagOverrideMap.mockResolvedValue({ PAID_WELCOME_EMAIL: true });
    mockClaimReturning({ id: 'job-1' });
    mockUserSelect({ email: 'ada@example.com', name: 'Ada Lovelace' });
    mockMarkJob();

    const result = await maybeSendPaidWelcomeAfterEntitlement({
      appUserId: 'user-1',
      clerkUserId: 'clerk_1',
      subscription: subscription(),
      plan: 'pro',
    });

    expect(result).toEqual({
      status: 'sent',
      messageId: 'msg_1',
      jobId: 'job-1',
    });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.com',
        idempotencyKey: 'send_paid_welcome:sub_paid_1',
      })
    );
    expect(mockLogDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        recipientEmail: 'ada@example.com',
        status: 'sent',
        providerMessageId: 'msg_1',
        metadata: { notificationType: 'paid_welcome' },
      })
    );
  });

  it('does not send twice when the claim loses the race', async () => {
    mockGetFlagOverrideMap.mockResolvedValue({ PAID_WELCOME_EMAIL: true });
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const first = await maybeSendPaidWelcomeAfterEntitlement({
      appUserId: 'user-1',
      clerkUserId: 'clerk_1',
      subscription: subscription(),
      plan: 'pro',
    });
    const retry = await maybeSendPaidWelcomeAfterEntitlement({
      appUserId: 'user-1',
      clerkUserId: 'clerk_1',
      subscription: subscription(),
      plan: 'pro',
    });

    expect(first).toEqual({ status: 'skipped', reason: 'already_sent' });
    expect(retry).toEqual({ status: 'skipped', reason: 'already_sent' });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
