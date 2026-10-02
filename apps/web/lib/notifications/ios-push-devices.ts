import 'server-only';

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  type IosPushEnvironment,
  iosPushDevices,
} from '@/lib/db/schema/ios-push-devices';
import { recipientPreferences } from '@/lib/db/schema/recipient-preferences';
import {
  defaultRecipientPreferences,
  toStoredRecipientPreferences,
} from '@/lib/notifications/recipient-preferences';
import { encryptPII } from '@/lib/utils/pii-encryption';

export interface RegisterIosPushDeviceInput {
  readonly userId: string;
  readonly token: string;
  readonly environment: IosPushEnvironment;
  readonly timezone: string;
}

function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function ensurePushPreference(
  betterAuthUserId: string,
  timezone: string
): Promise<void> {
  const defaults = defaultRecipientPreferences({
    betterAuthUserId,
    recipientKind: 'customer',
    localTimezone: timezone,
  });
  const stored = toStoredRecipientPreferences({
    ...defaults,
    channels: { ...defaults.channels, push: true },
  });

  // Missing preference rows represent untouched defaults. The native OS grant
  // is the user's first explicit push choice, so seed push on. Existing channel
  // choices stay untouched (channelPush=false is authoritative), while the
  // device-reported timezone stays current for canonical delivery windows.
  await db
    .insert(recipientPreferences)
    .values({
      betterAuthUserId: stored.betterAuthUserId,
      preferenceVersion: stored.preferenceVersion,
      recipientKind: stored.recipientKind,
      timezone: stored.timezone,
      quietHoursStart: stored.quietHoursStart,
      quietHoursEnd: stored.quietHoursEnd,
      weekendBehavior: stored.weekendBehavior,
      briefingBehavior: stored.briefingBehavior,
      channelEmail: stored.channelEmail,
      channelSms: stored.channelSms,
      channelPush: stored.channelPush,
      channelInApp: stored.channelInApp,
      marketingOptIn: stored.marketingOptIn,
      marketingConsentVersion: stored.marketingConsentVersion,
      marketingConsentRecordedAt: null,
    })
    .onConflictDoUpdate({
      target: recipientPreferences.betterAuthUserId,
      set: { timezone: stored.timezone, updatedAt: new Date() },
    });
}

export async function registerIosPushDevice(
  input: RegisterIosPushDeviceInput
): Promise<void> {
  const [user] = await db
    .select({ betterAuthUserId: users.betterAuthUserId })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!user?.betterAuthUserId) {
    throw new Error('Authenticated user has no Better Auth identity');
  }

  const encryptedToken = encryptPII(input.token);
  if (!encryptedToken) throw new Error('Failed to encrypt APNs device token');

  const now = new Date();
  await db
    .insert(iosPushDevices)
    .values({
      userId: input.userId,
      tokenHash: hashDeviceToken(input.token),
      encryptedToken,
      environment: input.environment,
      lastRegisteredAt: now,
      disabledAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: iosPushDevices.tokenHash,
      set: {
        userId: input.userId,
        encryptedToken,
        environment: input.environment,
        lastRegisteredAt: now,
        disabledAt: null,
        updatedAt: now,
      },
    });

  await ensurePushPreference(user.betterAuthUserId, input.timezone);
}

export async function unregisterIosPushDevice(input: {
  readonly userId: string;
  readonly token: string;
}): Promise<void> {
  await db
    .delete(iosPushDevices)
    .where(
      and(
        eq(iosPushDevices.userId, input.userId),
        eq(iosPushDevices.tokenHash, hashDeviceToken(input.token))
      )
    );
}
