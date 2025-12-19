import { sql as drizzleSql, eq, inArray } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { trackServerEvent } from '@/lib/analytics/runtime-aware';
import { db } from '@/lib/db';
import { notificationOutbox, waitlistInvites } from '@/lib/db/schema';
import { env } from '@/lib/env-server';
import type { NotificationOutboxPayload } from '@/lib/notifications/outbox';
import { sendNotification } from '@/lib/notifications/service';
import type {
  NotificationChannelResult,
  NotificationDeliveryChannel,
} from '@/types/notifications';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const CRON_SECRET = process.env.CRON_SECRET;

const deliverySchema = z.object({
  batchSize: z.number().int().min(1).max(200).default(50),
  channels: z
    .array(z.enum(['email', 'sms', 'push', 'in_app']))
    .optional()
    .default(['email', 'sms', 'push', 'in_app']),
});

const isAuthorized = (request: NextRequest): boolean => {
  const secret = env.INGESTION_CRON_SECRET ?? CRON_SECRET;
  if (!secret) {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader === `Bearer ${secret}`) {
    return true;
  }

  return request.headers.get('x-ingestion-secret') === secret;
};

const resolveNextAttemptAt = (attempt: number, now: Date) => {
  const delaySeconds = Math.min(60 * 2 ** Math.max(attempt - 1, 0), 60 * 60);
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
};

const mapChannelResult = (
  results: NotificationChannelResult[],
  channel: NotificationDeliveryChannel
) => results.find(result => result.channel === channel);

const updateWaitlistInviteStatus = async (
  payload: NotificationOutboxPayload,
  outcome: 'sent' | 'failed',
  errorMessage?: string
) => {
  const waitlistInviteId = payload.metadata?.waitlistInviteId;
  if (!waitlistInviteId) return;

  if (outcome === 'sent') {
    await db
      .update(waitlistInvites)
      .set({
        status: 'sent',
        error: null,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(waitlistInvites.id, waitlistInviteId));
    return;
  }

  await db
    .update(waitlistInvites)
    .set({
      status: 'failed',
      error: errorMessage ?? 'Notification delivery failed',
      updatedAt: new Date(),
    })
    .where(eq(waitlistInvites.id, waitlistInviteId));
};

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = deliverySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const { batchSize, channels } = parsed.data;
  const now = new Date();

  const claimedRows = await db.transaction(async tx => {
    const result = await tx.execute(
      drizzleSql`
        select
          id,
          channel,
          payload,
          status,
          created_at as "createdAt"
        from notification_outbox
        where status = 'pending'
          and channel = any(${channels})
          and (
            payload->'metadata'->>'nextAttemptAt' is null
            or (payload->'metadata'->>'nextAttemptAt')::timestamptz <= ${now}
          )
        order by created_at asc
        limit ${batchSize}
        for update skip locked
      `
    );

    const rows = result.rows as Array<{
      id: string;
      channel: NotificationDeliveryChannel;
      payload: NotificationOutboxPayload;
      status: string;
      createdAt: Date;
    }>;

    const ids = rows.map(row => row.id);

    if (ids.length === 0) {
      return [];
    }

    await tx
      .update(notificationOutbox)
      .set({ status: 'processing' })
      .where(inArray(notificationOutbox.id, ids));

    return rows;
  });

  if (claimedRows.length === 0) {
    return NextResponse.json(
      { ok: true, processed: 0 },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  const grouped = claimedRows.reduce(
    (acc, row) => {
      acc[row.channel] = acc[row.channel] ?? [];
      acc[row.channel]?.push(row);
      return acc;
    },
    {} as Record<NotificationDeliveryChannel, typeof claimedRows>
  );

  const results = await Promise.all(
    Object.entries(grouped).map(async ([channel, rows]) => {
      return Promise.all(
        rows.map(async row => {
          const payload = row.payload;
          const message = {
            ...payload.message,
            channels: [channel as NotificationDeliveryChannel],
          };
          const target = payload.target;
          const metadata = payload.metadata ?? {};
          const attempts = (metadata.attempts ?? 0) + 1;
          const maxAttempts = metadata.maxAttempts ?? 3;

          const dispatchResult = await sendNotification(message, target);
          const channelResult =
            mapChannelResult(
              dispatchResult.results,
              channel as NotificationDeliveryChannel
            ) ?? dispatchResult.results[0];

          if (channelResult?.status !== 'error') {
            await db
              .update(notificationOutbox)
              .set({ status: 'sent' })
              .where(eq(notificationOutbox.id, row.id));

            await trackServerEvent('notifications_delivery_success', {
              channel,
              provider: channelResult?.provider ?? 'unknown',
              status: channelResult?.status ?? 'sent',
            });

            await updateWaitlistInviteStatus(payload, 'sent');
            return { id: row.id, status: 'sent' };
          }

          const errorMessage =
            channelResult?.error ?? channelResult?.detail ?? 'Unknown error';
          const nextAttemptAt =
            attempts >= maxAttempts
              ? null
              : resolveNextAttemptAt(attempts, now);

          const updatedPayload: NotificationOutboxPayload = {
            ...payload,
            metadata: {
              ...metadata,
              attempts,
              maxAttempts,
              nextAttemptAt: nextAttemptAt ?? undefined,
              lastError: errorMessage,
            },
          };

          await db
            .update(notificationOutbox)
            .set({
              status: attempts >= maxAttempts ? 'failed' : 'pending',
              payload: updatedPayload,
            })
            .where(eq(notificationOutbox.id, row.id));

          await trackServerEvent('notifications_delivery_failed', {
            channel,
            provider: channelResult?.provider ?? 'unknown',
            attempt: attempts,
            max_attempts: maxAttempts,
            error: errorMessage,
          });

          if (attempts >= maxAttempts) {
            await updateWaitlistInviteStatus(payload, 'failed', errorMessage);
          }

          return {
            id: row.id,
            status: attempts >= maxAttempts ? 'failed' : 'pending',
          };
        })
      );
    })
  );

  const flattened = results.flat().flat();

  return NextResponse.json(
    {
      ok: true,
      processed: flattened.length,
      sent: flattened.filter(item => item.status === 'sent').length,
      failed: flattened.filter(item => item.status === 'failed').length,
      pending: flattened.filter(item => item.status === 'pending').length,
    },
    { status: 200, headers: NO_STORE_HEADERS }
  );
}
