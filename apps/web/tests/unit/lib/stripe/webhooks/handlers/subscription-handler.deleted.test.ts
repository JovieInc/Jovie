/**
 * Subscription Handler Tests - Deleted Events
 */
const mockTrackServerEvent = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true as const,
    eventId: 'server-event-1',
    deduplicated: false,
  }))
);

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
  trackServerEventTx: vi.fn(async () => ({
    ok: true as const,
    eventId: 'server-event-1',
    deduplicated: false,
  })),
}));

import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WEBHOOK_UNIX_SEC = 1_700_000_000;
const WEBHOOK_EVENT_TIMESTAMP = new Date(WEBHOOK_UNIX_SEC * 1000);

import type { SubscriptionHandler } from '@/lib/stripe/webhooks/handlers/subscription-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';
import {
  mockCaptureCriticalError,
  mockExpireReferralOnChurn,
  mockGetUserIdFromStripeCustomer,
  mockInvalidateBillingCache,
  mockLogFallback,
  mockNotifySlackCancellation,
  mockUpdateUserBillingStatus,
  setupDefaultMocks,
} from './subscription-handler.test-utils';

describe('@critical SubscriptionHandler - Deleted', () => {
  let handler: SubscriptionHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { SubscriptionHandler: SubscriptionHandlerClass } = await import(
      '@/lib/stripe/webhooks/handlers/subscription-handler'
    );
    handler = new SubscriptionHandlerClass();
    setupDefaultMocks();
  });

  it('processes subscription deleted and revokes pro access', async () => {
    const stripeEventTimestamp = new Date('2026-09-27T11:00:00.000Z');
    const context: WebhookContext = {
      event: {
        id: 'evt_deleted_123',
        type: 'customer.subscription.deleted',
        created: WEBHOOK_UNIX_SEC,
        data: {
          object: {
            id: 'sub_deleted_123',
            status: 'canceled',
            customer: 'cus_deleted',
            metadata: { clerk_user_id: 'user_deleted' },
            canceled_at: WEBHOOK_UNIX_SEC,
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_deleted_123',
      stripeEventTimestamp,
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user_deleted',
        isPro: false,
        stripeSubscriptionId: null,
        eventType: 'subscription_deleted',
        metadata: expect.objectContaining({
          subscriptionStatus: 'canceled',
        }),
      })
    );
    expect(mockInvalidateBillingCache).toHaveBeenCalled();
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'subscription_churned',
      { stripeEventId: 'evt_deleted_123' },
      undefined,
      {
        eventIdentity: 'stripe:evt_deleted_123',
        occurredAt: stripeEventTimestamp,
      }
    );
  });

  it('sends a Slack cancellation notification on subscription deleted', async () => {
    const context: WebhookContext = {
      event: {
        id: 'evt_deleted_slack',
        type: 'customer.subscription.deleted',
        created: WEBHOOK_UNIX_SEC,
        data: {
          object: {
            id: 'sub_deleted_slack',
            status: 'canceled',
            customer: 'cus_deleted_slack',
            metadata: { clerk_user_id: 'user_deleted_slack' },
            canceled_at: WEBHOOK_UNIX_SEC,
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_deleted_slack',
      stripeEventTimestamp: WEBHOOK_EVENT_TIMESTAMP,
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    await vi.waitFor(() => {
      expect(mockNotifySlackCancellation).toHaveBeenCalledWith('A user');
    });
  });

  it('does not send a Slack cancellation notification for skipped stale events', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({
      success: true,
      skipped: true,
      reason: 'stale_event',
      appUserId: 'app_user_deleted_skipped',
    });

    const context: WebhookContext = {
      event: {
        id: 'evt_deleted_skipped_slack',
        type: 'customer.subscription.deleted',
        created: WEBHOOK_UNIX_SEC,
        data: {
          object: {
            id: 'sub_deleted_skipped_slack',
            status: 'canceled',
            customer: 'cus_deleted_skipped_slack',
            metadata: { clerk_user_id: 'user_deleted_skipped_slack' },
            canceled_at: WEBHOOK_UNIX_SEC,
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_deleted_skipped_slack',
      stripeEventTimestamp: WEBHOOK_EVENT_TIMESTAMP,
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(mockNotifySlackCancellation).not.toHaveBeenCalled();
  });

  it('falls back to customer ID lookup when metadata is missing', async () => {
    mockGetUserIdFromStripeCustomer.mockResolvedValue('user_deleted_from_db');

    const context: WebhookContext = {
      event: {
        id: 'evt_deleted_no_meta',
        type: 'customer.subscription.deleted',
        created: WEBHOOK_UNIX_SEC,
        data: {
          object: {
            id: 'sub_deleted_no_meta',
            status: 'canceled',
            customer: 'cus_deleted_no_meta',
            metadata: {},
            canceled_at: WEBHOOK_UNIX_SEC,
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_deleted_no_meta',
      stripeEventTimestamp: WEBHOOK_EVENT_TIMESTAMP,
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(mockLogFallback).toHaveBeenCalledWith(
      'No user ID in subscription metadata',
      expect.objectContaining({ event: 'customer.subscription.deleted' })
    );
    expect(mockGetUserIdFromStripeCustomer).toHaveBeenCalledWith(
      'cus_deleted_no_meta'
    );
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user_deleted_from_db',
        isPro: false,
        eventType: 'subscription_deleted',
      })
    );
  });

  it('throws error when billing update fails on deletion', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({
      success: false,
      error: 'Database error',
    });

    const context: WebhookContext = {
      event: {
        id: 'evt_deleted_fail',
        type: 'customer.subscription.deleted',
        created: WEBHOOK_UNIX_SEC,
        data: {
          object: {
            id: 'sub_deleted_fail',
            status: 'canceled',
            customer: 'cus_deleted_fail',
            metadata: { clerk_user_id: 'user_deleted_fail' },
            canceled_at: WEBHOOK_UNIX_SEC,
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_deleted_fail',
      stripeEventTimestamp: WEBHOOK_EVENT_TIMESTAMP,
    };

    await expect(handler.handle(context)).rejects.toThrow(
      'Failed to downgrade user: Database error'
    );

    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Failed to downgrade user on subscription deletion',
      expect.any(Error),
      expect.objectContaining({
        userId: 'user_deleted_fail',
        route: '/api/stripe/webhooks',
        event: 'customer.subscription.deleted',
      })
    );
  });

  it('completes churn analytics and referral expiry on duplicate_event retry without re-sending Slack', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({
      success: true,
      skipped: true,
      reason: 'duplicate_event',
      skipReason: 'duplicate_event',
      appUserId: 'app_user_deleted_duplicate',
    });

    const context: WebhookContext = {
      event: {
        id: 'evt_deleted_duplicate',
        type: 'customer.subscription.deleted',
        created: WEBHOOK_UNIX_SEC,
        data: {
          object: {
            id: 'sub_deleted_duplicate',
            status: 'canceled',
            customer: 'cus_deleted_duplicate',
            metadata: { clerk_user_id: 'user_deleted_duplicate' },
            canceled_at: WEBHOOK_UNIX_SEC,
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_deleted_duplicate',
      stripeEventTimestamp: WEBHOOK_EVENT_TIMESTAMP,
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('duplicate_event');
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      'subscription_churned',
      { stripeEventId: 'evt_deleted_duplicate' },
      undefined,
      expect.objectContaining({
        eventIdentity: 'stripe:evt_deleted_duplicate',
      })
    );
    expect(mockExpireReferralOnChurn).toHaveBeenCalledWith(
      'app_user_deleted_duplicate'
    );
    expect(mockNotifySlackCancellation).not.toHaveBeenCalled();
  });

  it('does not run churn or referral post-effects for stale_event skips', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({
      success: true,
      skipped: true,
      reason: 'stale_event',
      skipReason: 'stale_event',
      appUserId: 'app_user_deleted_stale',
    });

    const context: WebhookContext = {
      event: {
        id: 'evt_deleted_stale_churn',
        type: 'customer.subscription.deleted',
        created: WEBHOOK_UNIX_SEC,
        data: {
          object: {
            id: 'sub_deleted_stale_churn',
            status: 'canceled',
            customer: 'cus_deleted_stale_churn',
            metadata: { clerk_user_id: 'user_deleted_stale' },
            canceled_at: WEBHOOK_UNIX_SEC,
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_deleted_stale_churn',
      stripeEventTimestamp: WEBHOOK_EVENT_TIMESTAMP,
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(mockTrackServerEvent).not.toHaveBeenCalled();
    expect(mockExpireReferralOnChurn).not.toHaveBeenCalled();
    expect(mockNotifySlackCancellation).not.toHaveBeenCalled();
  });

  it('propagates skipped result from billing update on deletion', async () => {
    mockUpdateUserBillingStatus.mockResolvedValue({
      success: true,
      skipped: true,
      reason: 'stale_event',
      appUserId: 'app_user_deleted_skipped',
    });

    const context: WebhookContext = {
      event: {
        id: 'evt_deleted_skipped',
        type: 'customer.subscription.deleted',
        created: WEBHOOK_UNIX_SEC,
        data: {
          object: {
            id: 'sub_deleted_skipped',
            status: 'canceled',
            customer: 'cus_deleted_skipped',
            metadata: { clerk_user_id: 'user_deleted_skipped' },
            canceled_at: WEBHOOK_UNIX_SEC,
            items: { data: [{ price: { id: 'price_pro' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_deleted_skipped',
      stripeEventTimestamp: WEBHOOK_EVENT_TIMESTAMP,
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('stale_event');
  });
});
