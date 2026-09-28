import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recipientPreferences } from '@/lib/db/schema/recipient-preferences';
import {
  type RecipientKind,
  type RecipientPreferences,
  type RecipientPreferencesStore,
  readRecipientPreferences,
  type StoredRecipientPreferences,
  writeRecipientPreferences,
} from './recipient-preferences';

function toStored(
  row: typeof recipientPreferences.$inferSelect
): StoredRecipientPreferences {
  return {
    betterAuthUserId: row.betterAuthUserId,
    preferenceVersion: row.preferenceVersion,
    recipientKind: row.recipientKind,
    timezone: row.timezone,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    weekendBehavior: row.weekendBehavior,
    briefingBehavior: row.briefingBehavior,
    channelEmail: row.channelEmail,
    channelSms: row.channelSms,
    channelPush: row.channelPush,
    channelInApp: row.channelInApp,
    marketingOptIn: row.marketingOptIn,
    marketingConsentVersion: row.marketingConsentVersion,
    marketingConsentRecordedAt: row.marketingConsentRecordedAt
      ? row.marketingConsentRecordedAt.toISOString()
      : null,
  };
}

export const drizzleRecipientPreferencesStore: RecipientPreferencesStore = {
  async find(betterAuthUserId) {
    const [row] = await db
      .select()
      .from(recipientPreferences)
      .where(eq(recipientPreferences.betterAuthUserId, betterAuthUserId))
      .limit(1);
    return row ? toStored(row) : null;
  },

  async save(row) {
    const recordedAt = row.marketingConsentRecordedAt
      ? new Date(row.marketingConsentRecordedAt)
      : null;
    await db
      .insert(recipientPreferences)
      .values({
        betterAuthUserId: row.betterAuthUserId,
        preferenceVersion: row.preferenceVersion,
        recipientKind: row.recipientKind,
        timezone: row.timezone,
        quietHoursStart: row.quietHoursStart,
        quietHoursEnd: row.quietHoursEnd,
        weekendBehavior: row.weekendBehavior,
        briefingBehavior: row.briefingBehavior,
        channelEmail: row.channelEmail,
        channelSms: row.channelSms,
        channelPush: row.channelPush,
        channelInApp: row.channelInApp,
        marketingOptIn: row.marketingOptIn,
        marketingConsentVersion: row.marketingConsentVersion,
        marketingConsentRecordedAt: recordedAt,
      })
      .onConflictDoUpdate({
        target: recipientPreferences.betterAuthUserId,
        set: {
          preferenceVersion: row.preferenceVersion,
          recipientKind: row.recipientKind,
          timezone: row.timezone,
          quietHoursStart: row.quietHoursStart,
          quietHoursEnd: row.quietHoursEnd,
          weekendBehavior: row.weekendBehavior,
          briefingBehavior: row.briefingBehavior,
          channelEmail: row.channelEmail,
          channelSms: row.channelSms,
          channelPush: row.channelPush,
          channelInApp: row.channelInApp,
          marketingOptIn: row.marketingOptIn,
          marketingConsentVersion: row.marketingConsentVersion,
          marketingConsentRecordedAt: recordedAt,
          updatedAt: new Date(),
        },
      });
  },
};

export function readStoredRecipientPreferences(input: {
  betterAuthUserId: string;
  recipientKind: RecipientKind;
  localTimezone?: string;
}): Promise<RecipientPreferences> {
  return readRecipientPreferences(input, drizzleRecipientPreferencesStore);
}

export function writeStoredRecipientPreferences(
  input: unknown
): Promise<RecipientPreferences> {
  return writeRecipientPreferences(input, drizzleRecipientPreferencesStore);
}
