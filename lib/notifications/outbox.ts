import { trackServerEvent } from '@/lib/analytics/runtime-aware';
import { db } from '@/lib/db';
import { notificationOutbox } from '@/lib/db/schema';
import type {
  NotificationDeliveryChannel,
  NotificationMessage,
  NotificationTarget,
} from '@/types/notifications';

export type NotificationOutboxPayload = {
  message: NotificationMessage;
  target: NotificationTarget;
  metadata?: {
    attempts?: number;
    maxAttempts?: number;
    nextAttemptAt?: string;
    source?: string;
    waitlistInviteId?: string;
    lastError?: string;
  };
};

const DEFAULT_CHANNELS: NotificationDeliveryChannel[] = ['email'];
const DEFAULT_MAX_ATTEMPTS = 3;

type EnqueueNotificationOutboxParams = {
  message: NotificationMessage;
  target: NotificationTarget;
  channels?: NotificationDeliveryChannel[];
  source?: string;
  maxAttempts?: number;
  metadata?: NotificationOutboxPayload['metadata'];
};

export const enqueueNotificationOutbox = async ({
  message,
  target,
  channels,
  source,
  maxAttempts,
  metadata,
}: EnqueueNotificationOutboxParams) => {
  const uniqueChannels = Array.from(
    new Set(channels ?? message.channels ?? DEFAULT_CHANNELS)
  ) as NotificationDeliveryChannel[];

  const payloadBase: NotificationOutboxPayload = {
    message,
    target,
    metadata: {
      attempts: 0,
      maxAttempts: maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      ...metadata,
      source: source ?? metadata?.source,
    },
  };

  const rows = uniqueChannels.map(channel => ({
    channel,
    payload: {
      ...payloadBase,
      message: {
        ...message,
        channels: [channel],
      },
    } as Record<string, unknown>,
    status: 'pending' as const,
    createdAt: new Date(),
  }));

  const inserted = await db.insert(notificationOutbox).values(rows).returning({
    id: notificationOutbox.id,
    channel: notificationOutbox.channel,
  });

  await Promise.all(
    inserted.map(entry =>
      trackServerEvent('notifications_outbox_enqueued', {
        channel: entry.channel,
        source: payloadBase.metadata?.source ?? 'unknown',
      })
    )
  );

  return inserted;
};
