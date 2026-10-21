// @vitest-environment node
/**
 * Paid Stripe events that cannot be applied yet must never be acknowledged and
 * forgotten (audit 2026-10-21 F17: an unknown price returned 200 "skipped",
 * Stripe never retried, and the paid entitlement was lost).
 *
 * Real route handlers, real webhook handlers, real billing persistence and the
 * real replay run against real Postgres. Only the Stripe network client is
 * replaced (signatures are still verified by the real Stripe SDK), plus
 * external notification sinks (Slack, email, Redis cache) that this test does
 * not exercise.
 *
 * The app talks to the database through its production driver
 * (@neondatabase/serverless over WebSocket).
 *
 * Targets:
 * - STRIPE_RECONCILIATION_TEST_DATABASE_URL: disposable loopback Postgres
 *   (127.0.0.1, database name starting with `jovie_stripe_recon`). The test
 *   bridges the Neon WebSocket driver to it and applies migrations first.
 * - DB_CERTIFICATION=true + DATABASE_URL: the isolated, already-migrated Neon
 *   certification branch in CI.
 */
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { neonConfig } from '@neondatabase/serverless';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { NextRequest } from 'next/server';
import path from 'path';
import postgres from 'postgres';
import Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

const WEBHOOK_SECRET = 'whsec_reconciliation_regression';
const MERCH_SECRET = 'whsec_reconciliation_regression_merch';
const TIPS_SECRET = 'whsec_reconciliation_regression_tips';

const { mockCaptureCriticalError } = vi.hoisted(() => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_reconciliation_regression';
  process.env.STRIPE_WEBHOOK_SECRET_MERCH =
    'whsec_reconciliation_regression_merch';
  process.env.STRIPE_WEBHOOK_SECRET_TIPS =
    'whsec_reconciliation_regression_tips';
  const loopback = process.env.STRIPE_RECONCILIATION_TEST_DATABASE_URL?.trim();
  if (loopback) process.env.DATABASE_URL = loopback;
  return { mockCaptureCriticalError: vi.fn() };
});

// Stripe network only: signature verification stays the real SDK code.
vi.mock('@/lib/stripe/client', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/stripe/client')>();
  const { default: StripeSdk } = await import('stripe');
  return {
    ...actual,
    stripe: {
      webhooks: StripeSdk.webhooks,
      subscriptions: {
        retrieve: vi.fn(() => {
          throw new Error('Stripe network is not available in this test');
        }),
        cancel: vi.fn(() => {
          throw new Error('Stripe network is not available in this test');
        }),
      },
    },
  };
});

// Alert sink (Sentry) is observed, not exercised.
vi.mock('@/lib/error-tracking', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/error-tracking')>();
  return {
    ...actual,
    captureCriticalError: mockCaptureCriticalError,
  };
});

// External notification sinks unrelated to the entitlement under test.
vi.mock('@/lib/notifications/providers/slack', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    notifySlackUpgrade: vi.fn(async () => undefined),
    notifySlackCancellation: vi.fn(async () => undefined),
  };
});
// Next's cache invalidation needs a request context this test does not have.
vi.mock('next/cache', async importOriginal => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock('@/lib/email/paid-welcome', () => ({
  enqueuePaidWelcomeAfterEntitlement: vi.fn(),
}));

import { replayUnprocessedStripeWebhooks } from '@/lib/billing/webhook-replay';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { billingAuditLog, stripeWebhookEvents } from '@/lib/db/schema/billing';
import { PRICE_MAPPINGS } from '@/lib/stripe/config';

type Target = { url: string; mode: 'loopback' | 'certification' };

function resolveTarget(env: NodeJS.ProcessEnv): Target | null {
  const loopback = env.STRIPE_RECONCILIATION_TEST_DATABASE_URL?.trim();
  if (loopback) return { url: loopback, mode: 'loopback' };
  if (env.DB_CERTIFICATION !== 'true') return null;
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('Isolated Neon certification requires DATABASE_URL');
  }
  const parsed = new URL(databaseUrl);
  parsed.searchParams.delete('channel_binding');
  return { url: parsed.toString(), mode: 'certification' };
}

const target = resolveTarget(process.env);

function signedRequest(
  url: string,
  event: Record<string, unknown>,
  secret: string
): NextRequest {
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return new NextRequest(url, {
    method: 'POST',
    body: payload,
    headers: { 'stripe-signature': signature },
  });
}

describe.skipIf(!target)(
  'Stripe webhooks never acknowledge and lose a paid event (real Postgres)',
  () => {
    let client: ReturnType<typeof postgres>;
    let bridge: WebSocketServer | undefined;
    const suffix = randomUUID().slice(0, 8);
    const eventIds: string[] = [];
    const userIds: string[] = [];

    beforeAll(async () => {
      if (!target) throw new Error('Database target missing');
      const parsed = new URL(target.url);
      if (target.mode === 'loopback') {
        if (
          parsed.hostname !== '127.0.0.1' ||
          !parsed.pathname.startsWith('/jovie_stripe_recon')
        ) {
          throw new Error('Disposable local database required');
        }
        // Bridge the Neon WebSocket driver to plain local Postgres.
        bridge = new WebSocketServer({ port: 0, host: '127.0.0.1' });
        bridge.on('connection', (socket, request) => {
          const address = new URL(
            request.url ?? '/',
            'http://bridge'
          ).searchParams.get('address');
          const port = Number(address?.split(':')[1] ?? parsed.port ?? 5432);
          const tcp = net.connect(port, '127.0.0.1');
          socket.on('message', data => tcp.write(data as Buffer));
          tcp.on('data', data => socket.send(data));
          const close = () => {
            socket.close();
            tcp.destroy();
          };
          socket.on('close', close);
          socket.on('error', close);
          tcp.on('close', close);
          tcp.on('error', close);
        });
        await new Promise(resolve => bridge?.once('listening', resolve));
        const { port } = bridge.address() as net.AddressInfo;
        neonConfig.wsProxy = (host, hostPort) =>
          `127.0.0.1:${port}/v1?address=${host}:${hostPort}`;
        neonConfig.useSecureWebSocket = false;
        neonConfig.pipelineTLS = false;
        neonConfig.pipelineConnect = false;
      }
      client = postgres(target.url, {
        max: 1,
        connect_timeout: 30,
        onnotice: () => undefined,
        ...(target.mode === 'certification' ? { ssl: 'require' } : {}),
      });
      if (target.mode === 'loopback') {
        await migrate(drizzle(client), {
          migrationsFolder: path.join(process.cwd(), 'drizzle', 'migrations'),
        });
      }
    }, 120_000);

    afterAll(async () => {
      if (client) {
        await client`DROP TRIGGER IF EXISTS recon_capture_failure ON stripe_webhook_events`;
        await client`DROP FUNCTION IF EXISTS recon_capture_failure()`;
        if (eventIds.length > 0) {
          await client`DELETE FROM billing_audit_log WHERE stripe_event_id IN ${client(eventIds)}`;
          await client`DELETE FROM stripe_webhook_events WHERE stripe_event_id IN ${client(eventIds)}`;
        }
        if (userIds.length > 0) {
          await client`DELETE FROM billing_audit_log WHERE user_id IN ${client(userIds)}`;
          await client`DELETE FROM users WHERE id IN ${client(userIds)}`;
        }
      }
      await client?.end();
      bridge?.close();
    });

    async function seedUser(label: string) {
      const clerkId = `user_recon_${label}_${suffix}`;
      const [user] = await db
        .insert(users)
        .values({
          clerkId,
          email: `recon-${label}-${suffix}@example.test`,
          userStatus: 'active',
        })
        .returning({ id: users.id });
      userIds.push(user.id);
      return { appUserId: user.id, clerkId };
    }

    function subscriptionEvent(input: {
      eventId: string;
      clerkId: string;
      priceId: string;
      createdSeconds: number;
    }) {
      eventIds.push(input.eventId);
      return {
        id: input.eventId,
        object: 'event',
        type: 'customer.subscription.updated',
        created: input.createdSeconds,
        livemode: false,
        data: {
          object: {
            id: `sub_recon_${input.eventId}`,
            object: 'subscription',
            status: 'active',
            customer: `cus_recon_${suffix}`,
            metadata: { clerk_user_id: input.clerkId },
            items: {
              object: 'list',
              data: [
                {
                  id: `si_recon_${input.eventId}`,
                  price: { id: input.priceId, object: 'price' },
                },
              ],
            },
          },
        },
      };
    }

    async function webhookRow(eventId: string) {
      const [row] = await db
        .select()
        .from(stripeWebhookEvents)
        .where(eq(stripeWebhookEvents.stripeEventId, eventId));
      return row;
    }

    async function grants(eventId: string, appUserId: string) {
      const audit = await db
        .select({ id: billingAuditLog.id })
        .from(billingAuditLog)
        .where(eq(billingAuditLog.stripeEventId, eventId));
      const [user] = await db
        .select({ isPro: users.isPro, stripePriceId: users.stripePriceId })
        .from(users)
        .where(eq(users.id, appUserId));
      return { auditRows: audit.length, user };
    }

    async function postMain(event: Record<string, unknown>) {
      const { POST } = await import('@/app/api/stripe/webhooks/route');
      return POST(
        signedRequest(
          'https://jov.ie/api/stripe/webhooks',
          event,
          WEBHOOK_SECRET
        )
      );
    }

    it('captures an unmapped paid subscription, then grants it exactly once after the price is mapped', async () => {
      const { appUserId, clerkId } = await seedUser('price');
      const priceId = `price_recon_unmapped_${suffix}`;
      const eventId = `evt_recon_price_${suffix}`;
      // Old enough that the replay cron treats it as stuck.
      const createdSeconds = Math.floor(Date.now() / 1000) - 3 * 60 * 60;
      const event = subscriptionEvent({
        eventId,
        clerkId,
        priceId,
        createdSeconds,
      });

      const first = await postMain(event);
      expect(first.status).toBe(200);

      // 2xx is only allowed because the event is durably queued, unprocessed.
      const captured = await webhookRow(eventId);
      expect(captured).toMatchObject({
        type: 'customer.subscription.updated',
        processedAt: null,
        processingStartedAt: null,
        reconciliationStatus: 'needs_reconciliation',
        reconciliationReason: 'unknown_price_id',
      });
      expect(captured.reconciliationContext).toMatchObject({
        priceIds: [priceId],
        customerId: `cus_recon_${suffix}`,
        userId: clerkId,
        stripeEventId: eventId,
      });
      expect(captured.payload).toMatchObject({ id: eventId });
      await expect(first.json()).resolves.toMatchObject({
        received: true,
        reconciliation: 'needs_reconciliation',
      });
      expect(await grants(eventId, appUserId)).toMatchObject({
        auditRows: 0,
        user: { isPro: false },
      });
      expect(mockCaptureCriticalError).toHaveBeenCalledWith(
        'Stripe event needs reconciliation',
        expect.anything(),
        expect.objectContaining({
          stripeEventId: eventId,
          reconciliationReason: 'unknown_price_id',
        })
      );

      // A second delivery while still unmapped is captured again, not granted.
      const redelivered = await postMain(event);
      expect(redelivered.status).toBe(200);
      expect((await webhookRow(eventId)).reconciliationStatus).toBe(
        'needs_reconciliation'
      );

      // Replay before the fix: stays queued, nothing granted.
      const replayAt = new Date(Date.now() + 60_000);
      const blocked = await replayUnprocessedStripeWebhooks(replayAt);
      expect(
        blocked.needsReconciliation.map(issue => issue.stripeEventId)
      ).toContain(eventId);
      expect((await grants(eventId, appUserId)).auditRows).toBe(0);

      // The fix ships: the price is mapped.
      PRICE_MAPPINGS[priceId] = {
        priceId,
        plan: 'pro',
        amount: 1200,
        currency: 'usd',
        interval: 'month',
        description: 'Reconciliation regression price',
      };
      try {
        // Lease from the blocked attempt must expire before the next replay.
        const fixedAt = new Date(replayAt.getTime() + 11 * 60_000);
        const replayed = await replayUnprocessedStripeWebhooks(fixedAt);
        expect(replayed.processed).toBeGreaterThanOrEqual(1);
        expect(replayed.failed.map(i => i.stripeEventId)).not.toContain(
          eventId
        );

        const reconciled = await webhookRow(eventId);
        expect(reconciled.processedAt).not.toBeNull();
        expect(reconciled.reconciliationStatus).toBe('reconciled');
        expect(reconciled.reconciledAt).not.toBeNull();
        expect(await grants(eventId, appUserId)).toMatchObject({
          auditRows: 1,
          user: { isPro: true, stripePriceId: priceId },
        });

        // Exactly once: replay again and redeliver the same event id.
        const again = await replayUnprocessedStripeWebhooks(
          new Date(fixedAt.getTime() + 11 * 60_000)
        );
        expect(
          [...again.needsReconciliation, ...again.failed].map(
            i => i.stripeEventId
          )
        ).not.toContain(eventId);
        const duplicate = await postMain(event);
        expect(duplicate.status).toBe(200);
        await expect(duplicate.json()).resolves.toEqual({ received: true });
        expect((await grants(eventId, appUserId)).auditRows).toBe(1);
      } finally {
        delete PRICE_MAPPINGS[priceId];
      }
    }, 60_000);

    it('returns non-2xx and keeps the event retryable when the reconciliation capture fails', async () => {
      const { appUserId, clerkId } = await seedUser('fail');
      const eventId = `evt_recon_fail_${suffix}`;
      const event = subscriptionEvent({
        eventId,
        clerkId,
        priceId: `price_recon_fail_${suffix}`,
        createdSeconds: Math.floor(Date.now() / 1000),
      });

      await client.unsafe(`CREATE OR REPLACE FUNCTION recon_capture_failure() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected reconciliation capture failure'; END $$`);
      await client.unsafe(`CREATE TRIGGER recon_capture_failure BEFORE INSERT OR UPDATE ON stripe_webhook_events
        FOR EACH ROW WHEN (NEW.reconciliation_status = 'needs_reconciliation') EXECUTE FUNCTION recon_capture_failure()`);
      try {
        const response = await postMain(event);
        expect(response.status).toBe(500);

        const row = await webhookRow(eventId);
        expect(row).toMatchObject({
          processedAt: null,
          processingStartedAt: null,
          reconciliationStatus: null,
        });
        expect((await grants(eventId, appUserId)).auditRows).toBe(0);

        // Tips: the capture insert fails too → 500 so Stripe retries.
        const tipEventId = `evt_recon_tip_fail_${suffix}`;
        eventIds.push(tipEventId);
        const { POST: postTips } = await import(
          '@/app/api/webhooks/stripe-tips/route'
        );
        const tipResponse = await postTips(
          signedRequest(
            'https://jov.ie/api/webhooks/stripe-tips',
            {
              id: tipEventId,
              object: 'event',
              type: 'checkout.session.completed',
              created: Math.floor(Date.now() / 1000),
              data: {
                object: {
                  id: `cs_recon_tip_fail_${suffix}`,
                  object: 'checkout.session',
                  payment_status: 'paid',
                  amount_total: 500,
                  metadata: {},
                },
              },
            },
            TIPS_SECRET
          )
        );
        expect(tipResponse.status).toBe(500);
        expect(await webhookRow(tipEventId)).toBeUndefined();
      } finally {
        await client`DROP TRIGGER IF EXISTS recon_capture_failure ON stripe_webhook_events`;
      }
    }, 60_000);

    it('captures a paid merch checkout for an unknown order before acknowledging', async () => {
      const eventId = `evt_recon_merch_${suffix}`;
      eventIds.push(eventId);
      const orderId = randomUUID();
      const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
      const response = await POST(
        signedRequest(
          'https://jov.ie/api/webhooks/stripe-merch',
          {
            id: eventId,
            object: 'event',
            type: 'checkout.session.completed',
            created: Math.floor(Date.now() / 1000),
            data: {
              object: {
                id: `cs_recon_merch_${suffix}`,
                object: 'checkout.session',
                payment_status: 'paid',
                amount_total: 3500,
                customer: null,
                metadata: { merch_order_id: orderId },
              },
            },
          },
          MERCH_SECRET
        )
      );

      expect(response.status).toBe(200);
      const row = await webhookRow(eventId);
      expect(row).toMatchObject({
        processedAt: null,
        reconciliationStatus: 'needs_reconciliation',
        reconciliationReason: 'merch_order_not_found',
      });
      expect(row.reconciliationContext).toMatchObject({
        merchOrderId: orderId,
        amountTotal: 3500,
      });
    }, 60_000);

    it('captures an unattributable paid tip as a terminal reconciliation row', async () => {
      const eventId = `evt_recon_tip_${suffix}`;
      eventIds.push(eventId);
      const { POST } = await import('@/app/api/webhooks/stripe-tips/route');
      const response = await POST(
        signedRequest(
          'https://jov.ie/api/webhooks/stripe-tips',
          {
            id: eventId,
            object: 'event',
            type: 'checkout.session.completed',
            created: Math.floor(Date.now() / 1000),
            data: {
              object: {
                id: `cs_recon_tip_${suffix}`,
                object: 'checkout.session',
                payment_status: 'paid',
                amount_total: 500,
                metadata: { handle: `no-such-artist-${suffix}` },
              },
            },
          },
          TIPS_SECRET
        )
      );

      expect(response.status).toBe(200);
      const row = await webhookRow(eventId);
      expect(row).toMatchObject({
        reconciliationStatus: 'needs_reconciliation',
        reconciliationReason: 'tip_unattributed',
      });
      // Terminal: the subscription replay must not re-drive a tip.
      expect(row.processedAt).not.toBeNull();
      expect(row.reconciliationContext).toMatchObject({
        handle: `no-such-artist-${suffix}`,
        amountTotal: 500,
      });

      const queued = await db
        .select({ id: stripeWebhookEvents.id })
        .from(stripeWebhookEvents)
        .where(
          inArray(stripeWebhookEvents.stripeEventId, [
            eventId,
            `evt_recon_merch_${suffix}`,
          ])
        );
      expect(queued).toHaveLength(2);
    }, 60_000);
  }
);
