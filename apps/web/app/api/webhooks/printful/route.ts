import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { webhookEvents } from '@/lib/db/schema/suppression';
import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { handlePrintfulOrderEvent } from '@/lib/merch/orders';
import { verifyPrintfulWebhookSignature } from '@/lib/printful/client';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

// Uses processedAt as a short-lived lease while processed=false (same
// pattern as lib/notifications/sms-webhook and the stripe-merch route).
const WEBHOOK_CLAIM_STALE_MS = 10 * 60 * 1000;

async function claimWebhookEventForProcessing(id: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - WEBHOOK_CLAIM_STALE_MS);
  const [claimed] = await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(
      and(
        eq(webhookEvents.id, id),
        eq(webhookEvents.processed, false),
        or(
          isNull(webhookEvents.processedAt),
          lt(webhookEvents.processedAt, staleBefore)
        )
      )
    )
    .returning({ id: webhookEvents.id });
  return Boolean(claimed);
}

async function releaseWebhookEventClaim(
  id: string,
  errorMessage: string
): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ processedAt: null, error: errorMessage })
    .where(and(eq(webhookEvents.id, id), eq(webhookEvents.processed, false)));
}

function buildEventId(payload: {
  readonly type?: string;
  readonly occurred_at?: string;
  readonly store_id?: number | string;
  readonly data?: { readonly order?: { readonly id?: number | string } };
}): string {
  return [
    payload.type ?? 'unknown',
    payload.occurred_at ?? 'unknown-time',
    payload.store_id ?? 'unknown-store',
    payload.data?.order?.id ?? 'unknown-object',
  ].join(':');
}

export async function POST(request: Request) {
  if (!env.PRINTFUL_WEBHOOK_SECRET) {
    logger.error('PRINTFUL_WEBHOOK_SECRET not configured');
    return NextResponse.json(
      { error: 'Webhook not configured' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-pf-webhook-signature');
  if (!verifyPrintfulWebhookSignature({ rawBody, signature })) {
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  let payload: {
    readonly type?: string;
    readonly occurred_at?: string;
    readonly store_id?: number | string;
    readonly data?: { readonly order?: { readonly id?: number | string } };
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json(
      { error: 'Invalid payload' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const eventId = buildEventId(payload);
  const [inserted] = await db
    .insert(webhookEvents)
    .values({
      provider: 'printful',
      eventType: payload.type ?? 'unknown',
      eventId,
      payload: payload as Record<string, unknown>,
      processed: false,
    })
    .onConflictDoNothing({
      target: [webhookEvents.provider, webhookEvents.eventId],
    })
    .returning({ id: webhookEvents.id });

  let webhookEventId: string;
  if (inserted) {
    webhookEventId = inserted.id;
  } else {
    const [existing] = await db
      .select({
        id: webhookEvents.id,
        processed: webhookEvents.processed,
      })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.provider, 'printful'),
          eq(webhookEvents.eventId, eventId)
        )
      )
      .limit(1);
    if (existing?.processed === true) {
      // Already processed — duplicate delivery is a safe no-op.
      return NextResponse.json(
        { received: true },
        { headers: NO_STORE_HEADERS }
      );
    }
    // Recorded but never processed (a prior attempt failed or crashed).
    // Fall through so the retry replays instead of dead-lettering the event.
    webhookEventId = existing?.id ?? '';
  }

  // Claim the row before processing so concurrent duplicate deliveries
  // cannot both run the order handler (the unique index prevents double
  // inserts, not double processing of the same unprocessed row).
  const claimed = await claimWebhookEventForProcessing(webhookEventId);
  if (!claimed) {
    // Another delivery holds a fresh lease but has not durably completed.
    // Stay retryable so the event is not lost if that worker crashes.
    return NextResponse.json(
      { error: 'Webhook processing in progress' },
      {
        status: 503,
        headers: { ...NO_STORE_HEADERS, 'Retry-After': '5' },
      }
    );
  }

  try {
    await handlePrintfulOrderEvent(payload);
    await db
      .update(webhookEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(webhookEvents.id, webhookEventId));
    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('[merch] Printful webhook failed', { error, eventId });
    // Release the lease so the provider retry can reclaim and replay.
    await releaseWebhookEventClaim(
      webhookEventId,
      error instanceof Error ? error.message : 'Unknown error'
    );
    await captureCriticalError('Printful merch webhook failed', error, {
      route: '/api/webhooks/printful',
      eventId,
      eventType: payload.type,
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
