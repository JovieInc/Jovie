import 'server-only';

import { Notification, Provider } from '@parse/node-apn';
import { and, sql as drizzleSql, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { iosPushDevices } from '@/lib/db/schema/ios-push-devices';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { recipientPreferences } from '@/lib/db/schema/recipient-preferences';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { decryptPII } from '@/lib/utils/pii-encryption';
import type {
  NotificationChannelResult,
  NotificationMessage,
  NotificationTarget,
} from '@/types/notifications';

interface ApnsConfig {
  readonly key: string;
  readonly keyId: string;
  readonly teamId: string;
  readonly topic: string;
}

interface PushRecipient {
  readonly userId: string;
  readonly betterAuthUserId: string;
}

const INVALID_TOKEN_REASONS = new Set([
  'BadDeviceToken',
  'DeviceTokenNotForTopic',
  'Unregistered',
]);

function normalizePem(value: string): string {
  return value.replaceAll(String.raw`\n`, '\n').trim();
}

function getApnsConfig(): ApnsConfig | null {
  const keyId = env.JOVIE_IOS_APNS_KEY_ID?.trim();
  const teamId = env.JOVIE_IOS_APNS_TEAM_ID?.trim();
  const privateKey = env.JOVIE_IOS_APNS_PRIVATE_KEY?.trim();
  if (!keyId || !teamId || !privateKey) return null;

  return {
    key: normalizePem(privateKey),
    keyId,
    teamId,
    topic: env.JOVIE_IOS_APNS_TOPIC?.trim() || 'ie.jov.Jovie',
  };
}

async function resolvePushRecipient(
  target: NotificationTarget
): Promise<PushRecipient | null> {
  if (target.userId) {
    const [row] = await db
      .select({
        userId: users.id,
        betterAuthUserId: users.betterAuthUserId,
      })
      .from(users)
      .where(eq(users.id, target.userId))
      .limit(1);
    return row?.betterAuthUserId
      ? { userId: row.userId, betterAuthUserId: row.betterAuthUserId }
      : null;
  }

  if (target.creatorProfileId) {
    const [row] = await db
      .select({
        userId: users.id,
        betterAuthUserId: users.betterAuthUserId,
      })
      .from(creatorProfiles)
      .innerJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(creatorProfiles.id, target.creatorProfileId))
      .limit(1);
    return row?.betterAuthUserId
      ? { userId: row.userId, betterAuthUserId: row.betterAuthUserId }
      : null;
  }

  if (target.email) {
    const normalizedEmail = target.email.trim().toLowerCase();
    const [row] = await db
      .select({
        userId: users.id,
        betterAuthUserId: users.betterAuthUserId,
      })
      .from(users)
      .where(drizzleSql`lower(${users.email}) = ${normalizedEmail}`)
      .limit(1);
    return row?.betterAuthUserId
      ? { userId: row.userId, betterAuthUserId: row.betterAuthUserId }
      : null;
  }

  return null;
}

function buildNotification(
  message: NotificationMessage,
  config: ApnsConfig
): Notification {
  const notification = new Notification();
  notification.topic = config.topic;
  notification.pushType = 'alert';
  notification.priority = 10;
  notification.expiry = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  notification.alert = {
    title: message.pushTitle?.trim() || message.subject,
    body: message.pushBody?.trim() || message.text,
  };
  notification.sound = 'default';
  notification.payload = {
    notificationId: message.id ?? message.dedupKey ?? null,
    url: message.ctaUrl ?? null,
  };
  const collapseId = message.dedupKey ?? message.id;
  if (collapseId) notification.collapseId = collapseId.slice(0, 64);
  return notification;
}

export async function sendPushNotification(
  message: NotificationMessage,
  target: NotificationTarget
): Promise<NotificationChannelResult> {
  const recipient = await resolvePushRecipient(target);
  if (!recipient) {
    return {
      channel: 'push',
      status: 'skipped',
      detail: 'No app user available',
    };
  }

  const [preferences] = await db
    .select({ enabled: recipientPreferences.channelPush })
    .from(recipientPreferences)
    .where(
      eq(recipientPreferences.betterAuthUserId, recipient.betterAuthUserId)
    )
    .limit(1);
  if (!preferences?.enabled) {
    return {
      channel: 'push',
      status: 'skipped',
      detail: 'Channel disabled by preferences',
    };
  }

  const devices = await db
    .select({
      tokenHash: iosPushDevices.tokenHash,
      encryptedToken: iosPushDevices.encryptedToken,
      environment: iosPushDevices.environment,
    })
    .from(iosPushDevices)
    .where(
      and(
        eq(iosPushDevices.userId, recipient.userId),
        isNull(iosPushDevices.disabledAt)
      )
    );
  if (devices.length === 0) {
    return {
      channel: 'push',
      status: 'skipped',
      detail: 'No active iOS device',
    };
  }

  const config = getApnsConfig();
  if (!config) {
    return {
      channel: 'push',
      status: 'skipped',
      detail: 'APNs is not configured',
    };
  }

  const groups = new Map<'sandbox' | 'production', Map<string, string>>([
    ['sandbox', new Map()],
    ['production', new Map()],
  ]);
  for (const device of devices) {
    const token = decryptPII(device.encryptedToken);
    if (
      token &&
      (device.environment === 'sandbox' || device.environment === 'production')
    ) {
      groups.get(device.environment)?.set(token, device.tokenHash);
    }
  }

  let sentCount = 0;
  const invalidTokenHashes: string[] = [];
  const sentTokenHashes: string[] = [];

  try {
    for (const [environment, tokenMap] of groups) {
      if (tokenMap.size === 0) continue;
      const provider = new Provider({
        token: {
          key: config.key,
          keyId: config.keyId,
          teamId: config.teamId,
        },
        production: environment === 'production',
        requestTimeout: 5_000,
      });

      try {
        const result = await provider.send(buildNotification(message, config), [
          ...tokenMap.keys(),
        ]);
        sentCount += result.sent.length;
        for (const success of result.sent) {
          const hash = tokenMap.get(success.device);
          if (hash) sentTokenHashes.push(hash);
        }
        for (const failure of result.failed) {
          if (!INVALID_TOKEN_REASONS.has(failure.response?.reason ?? '')) {
            continue;
          }
          const hash = tokenMap.get(failure.device);
          if (hash) invalidTokenHashes.push(hash);
        }
      } finally {
        await provider.shutdown().catch(() => undefined);
      }
    }

    const now = new Date();
    if (sentTokenHashes.length > 0) {
      await db
        .update(iosPushDevices)
        .set({ lastDeliveredAt: now, updatedAt: now })
        .where(inArray(iosPushDevices.tokenHash, sentTokenHashes));
    }
    if (invalidTokenHashes.length > 0) {
      await db
        .update(iosPushDevices)
        .set({ disabledAt: now, updatedAt: now })
        .where(inArray(iosPushDevices.tokenHash, invalidTokenHashes));
    }
  } catch (error) {
    await captureError('APNs notification delivery failed', error, {
      notificationId: message.id,
      userId: recipient.userId,
    });
    return {
      channel: 'push',
      status: 'error',
      error: error instanceof Error ? error.message : 'APNs delivery failed',
    };
  }

  return sentCount > 0
    ? {
        channel: 'push',
        status: 'sent',
        provider: 'apns',
        detail: `${sentCount} device${sentCount === 1 ? '' : 's'}`,
      }
    : {
        channel: 'push',
        status: 'error',
        error: 'APNs rejected every device',
      };
}
