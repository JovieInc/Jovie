import { sql as drizzleSql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { baUsers } from './better-auth';

/**
 * Canonical recipient preferences for one Better Auth user (`ba_users.id`).
 *
 * This extends that identity. It is not a second user, auth, or consent
 * ledger: marketing opt-in lives on this row and is valid only with an
 * explicit consent version and timestamp. Fan SMS consent stays on
 * `notification_contacts`.
 *
 * JOV-6141.
 */

export const RECIPIENT_PREFERENCES_VERSION = 1 as const;

export const MARKETING_CONSENT_VERSION = 'recipient-marketing-v1' as const;

export const TIM_DEFAULT_TIMEZONE = 'America/Los_Angeles';

export const DEFAULT_QUIET_HOURS_START = '21:00';

export const DEFAULT_QUIET_HOURS_END = '08:00';

export const RECIPIENT_KINDS = ['tim', 'customer'] as const;

export const WEEKEND_BEHAVIORS = [
  'observe_quiet_hours',
  'weekend_briefing_eligible',
  'suppress_weekends',
] as const;

export const BRIEFING_BEHAVIORS = ['off', 'weekend_summer', 'daily'] as const;

export const RECIPIENT_CHANNELS = ['email', 'sms', 'push', 'in_app'] as const;

export const recipientPreferences = pgTable(
  'recipient_preferences',
  {
    betterAuthUserId: text('better_auth_user_id')
      .primaryKey()
      .references(() => baUsers.id, { onDelete: 'cascade' }),
    preferenceVersion: integer('preference_version').notNull(),
    recipientKind: text('recipient_kind').notNull(),
    timezone: text('timezone').notNull(),
    quietHoursStart: text('quiet_hours_start').notNull(),
    quietHoursEnd: text('quiet_hours_end').notNull(),
    weekendBehavior: text('weekend_behavior').notNull(),
    briefingBehavior: text('briefing_behavior').notNull(),
    channelEmail: boolean('channel_email').notNull().default(false),
    channelSms: boolean('channel_sms').notNull().default(false),
    channelPush: boolean('channel_push').notNull().default(false),
    channelInApp: boolean('channel_in_app').notNull().default(false),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
    marketingConsentVersion: text('marketing_consent_version'),
    marketingConsentRecordedAt: timestamp('marketing_consent_recorded_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    briefingIdx: index('recipient_preferences_briefing_idx').on(
      table.briefingBehavior
    ),
    versionValid: check(
      'recipient_preferences_version_valid',
      drizzleSql`${table.preferenceVersion} = 1`
    ),
    recipientKindValid: check(
      'recipient_preferences_recipient_kind_valid',
      drizzleSql`${table.recipientKind} in ('tim', 'customer')`
    ),
    weekendBehaviorValid: check(
      'recipient_preferences_weekend_behavior_valid',
      drizzleSql`${table.weekendBehavior} in ('observe_quiet_hours', 'weekend_briefing_eligible', 'suppress_weekends')`
    ),
    briefingBehaviorValid: check(
      'recipient_preferences_briefing_behavior_valid',
      drizzleSql`${table.briefingBehavior} in ('off', 'weekend_summer', 'daily')`
    ),
    quietHoursValid: check(
      'recipient_preferences_quiet_hours_valid',
      drizzleSql`${table.quietHoursStart} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.quietHoursEnd} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.quietHoursStart} <> ${table.quietHoursEnd}`
    ),
    // PostgreSQL CHECK accepts NULL. Comparing a missing version with `=`
    // yields NULL, so the opted-in arm must also require IS NOT NULL.
    marketingConsentValid: check(
      'recipient_preferences_marketing_consent_valid',
      drizzleSql`(${table.marketingOptIn} = false and ${table.marketingConsentVersion} is null and ${table.marketingConsentRecordedAt} is null) or (${table.marketingOptIn} = true and ${table.marketingConsentVersion} is not null and ${table.marketingConsentVersion} = 'recipient-marketing-v1' and ${table.marketingConsentRecordedAt} is not null)`
    ),
  })
);

export type RecipientPreference = typeof recipientPreferences.$inferSelect;
export type NewRecipientPreference = typeof recipientPreferences.$inferInsert;
