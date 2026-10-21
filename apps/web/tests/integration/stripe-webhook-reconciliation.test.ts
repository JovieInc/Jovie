// @vitest-environment node
// Real routes, persistence and replay over the production Neon driver. Only
// Stripe network calls and notification/cache sinks are stubbed; signatures stay real.
// Run on a migrated DB_CERTIFICATION branch or a disposable loopback database
// named jovie_stripe_recon* via STRIPE_RECONCILIATION_TEST_DATABASE_URL.
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
  const unavailable = vi.fn(() => {
    throw new Error('Stripe network is not available in this test');
  });
  return {
    ...actual,
    stripe: {
      webhooks: StripeSdk.webhooks,
      subscriptions: { retrieve: unavailable, cancel: unavailable },
    },
  };
});

vi.mock('@/lib/error-tracking', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/error-tracking')>()),
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/notifications/providers/slack', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  notifySlackUpgrade: vi.fn(async () => undefined),
  notifySlackCancellation: vi.fn(async () => undefined),
}));
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

    function subscriptionEvent(
      eventId: string,
      clerkId: string,
      priceId: string
    ) {
      eventIds.push(eventId);
      return {
        id: eventId,
        object: 'event',
        type: 'customer.subscription.updated',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        data: {
          object: {
            id: `sub_recon_${eventId}`,
            object: 'subscription',
            status: 'active',
            customer: `cus_recon_${suffix}`,
            metadata: { clerk_user_id: clerkId },
            items: {
              object: 'list',
              data: [
                {
                  id: `si_recon_${eventId}`,
                  price: { id: priceId, object: 'price' },
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

    function paidCheckout(
      eventId: string,
      amountTotal: number,
      metadata: Record<string, string>
    ) {
      eventIds.push(eventId);
      return {
        id: eventId,
        object: 'event',
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: `cs_${eventId}`,
            object: 'checkout.session',
            payment_status: 'paid',
            amount_total: amountTotal,
            customer: null,
            metadata,
          },
        },
      };
    }

    async function postWebhook(
      event: Record<string, unknown>,
      endpoint: 'main' | 'merch' | 'tips' = 'main'
    ) {
      const handlers = {
        main: () => import('@/app/api/stripe/webhooks/route'),
        merch: () => import('@/app/api/webhooks/stripe-merch/route'),
        tips: () => import('@/app/api/webhooks/stripe-tips/route'),
      };
      const secret = {
        main: WEBHOOK_SECRET,
        merch: MERCH_SECRET,
        tips: TIPS_SECRET,
      }[endpoint];
      const route =
        endpoint === 'main'
          ? '/api/stripe/webhooks'
          : `/api/webhooks/stripe-${endpoint}`;
      const { POST } = await handlers[endpoint]();
      const payload = JSON.stringify(event);
      return POST(
        new NextRequest(`https://jov.ie${route}`, {
          method: 'POST',
          body: payload,
          headers: {
            'stripe-signature': Stripe.webhooks.generateTestHeaderString({
              payload,
              secret,
            }),
          },
        })
      );
    }

    it('captures an unmapped paid subscription, then grants it exactly once after the price is mapped', async () => {
      const { appUserId, clerkId } = await seedUser('price');
      const priceId = `price_recon_unmapped_${suffix}`;
      const eventId = `evt_recon_price_${suffix}`;
      const event = subscriptionEvent(eventId, clerkId, priceId);

      const first = await postWebhook(event);
      expect(first.status).toBe(200);

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

      const redelivered = await postWebhook(event);
      expect(redelivered.status).toBe(200);
      expect((await webhookRow(eventId)).reconciliationStatus).toBe(
        'needs_reconciliation'
      );

      // Replay selects by the stored row's created_at, not Stripe's timestamp.
      const replayAt = new Date(Date.now() + 3 * 60 * 60_000);
      const blocked = await replayUnprocessedStripeWebhooks(replayAt);
      expect(
        blocked.needsReconciliation.map(issue => issue.stripeEventId)
      ).toContain(eventId);
      expect((await grants(eventId, appUserId)).auditRows).toBe(0);

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

        const again = await replayUnprocessedStripeWebhooks(
          new Date(fixedAt.getTime() + 11 * 60_000)
        );
        expect(
          [...again.needsReconciliation, ...again.failed].map(
            i => i.stripeEventId
          )
        ).not.toContain(eventId);
        const duplicate = await postWebhook(event);
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
      const event = subscriptionEvent(
        eventId,
        clerkId,
        `price_recon_fail_${suffix}`
      );

      await client.unsafe(`CREATE OR REPLACE FUNCTION recon_capture_failure() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected reconciliation capture failure'; END $$`);
      await client.unsafe(`CREATE TRIGGER recon_capture_failure BEFORE INSERT OR UPDATE ON stripe_webhook_events
        FOR EACH ROW WHEN (NEW.reconciliation_status = 'needs_reconciliation') EXECUTE FUNCTION recon_capture_failure()`);
      try {
        const response = await postWebhook(event);
        expect(response.status).toBe(500);

        const row = await webhookRow(eventId);
        expect(row).toMatchObject({
          processedAt: null,
          processingStartedAt: null,
          reconciliationStatus: null,
        });
        expect((await grants(eventId, appUserId)).auditRows).toBe(0);

        const tipEventId = `evt_recon_tip_fail_${suffix}`;
        const tipResponse = await postWebhook(
          paidCheckout(tipEventId, 500, {}),
          'tips'
        );
        expect(tipResponse.status).toBe(500);
        expect(await webhookRow(tipEventId)).toBeUndefined();
      } finally {
        await client`DROP TRIGGER IF EXISTS recon_capture_failure ON stripe_webhook_events`;
      }
    }, 60_000);

    it('captures a paid merch checkout for an unknown order before acknowledging', async () => {
      const eventId = `evt_recon_merch_${suffix}`;
      const orderId = randomUUID();
      const response = await postWebhook(
        paidCheckout(eventId, 3500, { merch_order_id: orderId }),
        'merch'
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
      const response = await postWebhook(
        paidCheckout(eventId, 500, { handle: `no-such-artist-${suffix}` }),
        'tips'
      );

      expect(response.status).toBe(200);
      const row = await webhookRow(eventId);
      expect(row).toMatchObject({
        reconciliationStatus: 'needs_reconciliation',
        reconciliationReason: 'tip_unattributed',
      });
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
