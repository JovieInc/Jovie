import { and, eq } from 'drizzle-orm';
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

  if (!inserted) {
    const [existing] = await db
      .select({ processed: webhookEvents.processed })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.provider, 'printful'),
          eq(webhookEvents.eventId, eventId)
        )
      )
      .limit(1);
    if (existing?.processed !== true) {
      const error = new Error(
        'Printful webhook replay found unprocessed event'
      );
      logger.error('[merch] Printful webhook replay is still unprocessed', {
        eventId,
      });
      await captureCriticalError(
        'Printful merch webhook replay blocked',
        error,
        {
          route: '/api/webhooks/printful',
          eventId,
          eventType: payload.type,
        }
      );
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS });
  }

  try {
    await handlePrintfulOrderEvent(payload);
    await db
      .update(webhookEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(webhookEvents.id, inserted.id));
    return NextResponse.json({ received: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    logger.error('[merch] Printful webhook failed', { error, eventId });
    await db
      .update(webhookEvents)
      .set({
        error: error instanceof Error ? error.message : 'Unknown error',
        processed: false,
      })
      .where(
        and(
          eq(webhookEvents.provider, 'printful'),
          eq(webhookEvents.eventId, eventId)
        )
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
