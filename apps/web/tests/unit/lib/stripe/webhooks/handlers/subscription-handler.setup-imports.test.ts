/**
 * JOV-8861 guard: the SubscriptionHandler setup import chain must stay light.
 *
 * Every subscription-handler test file dynamically imports the real handler
 * inside `beforeEach`, which runs under the CI hookTimeout (12s under the
 * affected gate). The handler's module graph must never cold-load the Clerk
 * auth stack (`@/lib/auth/session` -> `@/lib/auth/cached` -> impersonation /
 * app-user / dev-test-auth) or the real `@/lib/db/client`. The shared
 * test-utils mock `@/lib/ingestion/session` — the only seam that reaches that
 * chain (base-handler -> webhooks/reconciliation) — precisely so setup stays
 * deterministic under loaded shards.
 *
 * These mocks only execute their factories when the real module graph actually
 * requests the mocked specifier, so a flag flip proves the chain leaked back
 * into setup.
 */
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubscriptionHandler } from '@/lib/stripe/webhooks/handlers/subscription-handler';
import type { WebhookContext } from '@/lib/stripe/webhooks/types';
import {
  mockUpdateUserBillingStatus,
  setupDefaultMocks,
} from './subscription-handler.test-utils';

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: vi.fn(async () => ({
    ok: true as const,
    eventId: 'server-event-1',
    deduplicated: false,
  })),
  trackServerEventTx: vi.fn(async () => ({
    ok: true as const,
    eventId: 'server-event-1',
    deduplicated: false,
  })),
}));

const heavyModuleLoads = vi.hoisted(() => ({
  authSession: false,
  dbClient: false,
}));

vi.mock('@/lib/auth/session', () => {
  heavyModuleLoads.authSession = true;
  return {
    setTransactionSessionUserId: vi.fn(),
  };
});

vi.mock('@/lib/db/client', () => {
  heavyModuleLoads.dbClient = true;
  return {
    logDbError: vi.fn(),
    logDbInfo: vi.fn(),
    withRetry: vi.fn(),
  };
});

describe('SubscriptionHandler setup imports stay light (JOV-8861)', () => {
  let handler: SubscriptionHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { SubscriptionHandler: SubscriptionHandlerClass } = await import(
      '@/lib/stripe/webhooks/handlers/subscription-handler'
    );
    handler = new SubscriptionHandlerClass();
    setupDefaultMocks();
  });

  it('never cold-loads the Clerk auth stack or the real db client in setup', () => {
    expect(heavyModuleLoads.authSession).toBe(false);
    expect(heavyModuleLoads.dbClient).toBe(false);
  });

  it('still processes a subscription event end-to-end with the light setup', async () => {
    const context: WebhookContext = {
      event: {
        id: 'evt_setup_imports_guard',
        type: 'customer.subscription.created',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'sub_setup_imports_guard',
            status: 'active',
            customer: 'cus_setup_guard',
            metadata: { clerk_user_id: 'user_setup_guard' },
            items: { data: [{ price: { id: 'price_pro_monthly' } }] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event,
      stripeEventId: 'evt_setup_imports_guard',
      stripeEventTimestamp: new Date(),
    };

    const result = await handler.handle(context);

    expect(result.success).toBe(true);
    expect(result.skipped).toBeFalsy();
    expect(mockUpdateUserBillingStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'user_setup_guard',
        isPro: true,
        stripeSubscriptionId: 'sub_setup_imports_guard',
        eventType: 'subscription_created',
      })
    );
  });
});
