import { z } from 'zod';
import {
  BRIEFING_BEHAVIORS,
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  MARKETING_CONSENT_VERSION,
  RECIPIENT_KINDS,
  RECIPIENT_PREFERENCES_VERSION,
  TIM_DEFAULT_TIMEZONE,
  WEEKEND_BEHAVIORS,
} from '@/lib/db/schema/recipient-preferences';

/**
 * Typed read/write for canonical recipient preferences.
 *
 * Missing rows resolve to defaults and are not persisted. Marketing opt-in
 * stays false unless the caller records the current consent version. Channel
 * enablement, legacy marketing flags, and Clerk ids are not consent.
 */

export const QUIET_HOUR_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const INFERRED_CONSENT_KEYS = [
  'marketingEmails',
  'marketing_emails',
  'marketingOptOut',
  'marketing_opt_out',
  'clerkUserId',
  'clerk_id',
  'smsConsentAt',
  'smsConsentVersion',
  'sms_consent_at',
  'sms_consent_version',
] as const;

export type RecipientKind = (typeof RECIPIENT_KINDS)[number];
export type WeekendBehavior = (typeof WEEKEND_BEHAVIORS)[number];
export type BriefingBehavior = (typeof BRIEFING_BEHAVIORS)[number];

export type RecipientPreferencesErrorCode = 'invalid' | 'version' | 'consent';

export class RecipientPreferencesError extends Error {
  readonly code: RecipientPreferencesErrorCode;

  constructor(code: RecipientPreferencesErrorCode, message: string) {
    super(message);
    this.name = 'RecipientPreferencesError';
    this.code = code;
  }
}

export interface RecipientChannelEnablement {
  email: boolean;
  sms: boolean;
  push: boolean;
  in_app: boolean;
}

export interface MarketingConsentRecord {
  version: typeof MARKETING_CONSENT_VERSION;
  recordedAt: string;
}

export interface RecipientPreferences {
  version: typeof RECIPIENT_PREFERENCES_VERSION;
  betterAuthUserId: string;
  recipientKind: RecipientKind;
  timezone: string;
  quietHours: {
    start: string;
    end: string;
  };
  weekendBehavior: WeekendBehavior;
  briefingBehavior: BriefingBehavior;
  channels: RecipientChannelEnablement;
  marketingOptIn: boolean;
  marketingConsent: MarketingConsentRecord | null;
}

export interface StoredRecipientPreferences {
  betterAuthUserId: string;
  preferenceVersion: number;
  recipientKind: string;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  weekendBehavior: string;
  briefingBehavior: string;
  channelEmail: boolean;
  channelSms: boolean;
  channelPush: boolean;
  channelInApp: boolean;
  marketingOptIn: boolean;
  marketingConsentVersion: string | null;
  marketingConsentRecordedAt: string | null;
}

export interface RecipientPreferencesStore {
  find(betterAuthUserId: string): Promise<StoredRecipientPreferences | null>;
  save(row: StoredRecipientPreferences): Promise<void>;
}

const quietHourSchema = z
  .string()
  .regex(QUIET_HOUR_PATTERN, 'Quiet hours must be HH:MM in 24-hour time.');

const recipientPreferencesWriteSchema = z
  .object({
    betterAuthUserId: z.string().trim().min(1).max(128),
    recipientKind: z.enum(RECIPIENT_KINDS),
    timezone: z.string().trim().min(1).max(100),
    quietHours: z
      .object({
        start: quietHourSchema,
        end: quietHourSchema,
      })
      .strict(),
    weekendBehavior: z.enum(WEEKEND_BEHAVIORS),
    briefingBehavior: z.enum(BRIEFING_BEHAVIORS),
    channels: z
      .object({
        email: z.boolean(),
        sms: z.boolean(),
        push: z.boolean(),
        in_app: z.boolean(),
      })
      .strict(),
    marketingOptIn: z.boolean(),
    marketingConsent: z
      .object({
        version: z.literal(MARKETING_CONSENT_VERSION),
        recordedAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!isIanaTimeZone(value.timezone)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['timezone'],
        message: 'Timezone must be a valid IANA zone.',
      });
    }
    if (value.quietHours.start === value.quietHours.end) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quietHours'],
        message: 'Quiet hours start and end must differ.',
      });
    }
    const optedIn = value.marketingOptIn;
    const hasConsent = value.marketingConsent !== null;
    if (optedIn !== hasConsent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['marketingConsent'],
        message: optedIn
          ? 'Marketing opt-in requires an explicit consent record. Consent is never inferred.'
          : 'Marketing opt-out cannot retain a consent record.',
      });
    }
  });

const IANA_TIME_ZONES = new Set(Intl.supportedValuesOf('timeZone'));
const CANONICAL_TIME_ZONES = new Set(['UTC', 'Etc/UTC', 'GMT']);

export function isIanaTimeZone(timeZone: string): boolean {
  const zone = timeZone.trim();
  if (!zone || zone.toLowerCase() === 'local') return false;
  return IANA_TIME_ZONES.has(zone) || CANONICAL_TIME_ZONES.has(zone);
}

export function rejectInferredConsentSignals(input: unknown): void {
  if (!input || typeof input !== 'object') return;
  for (const key of INFERRED_CONSENT_KEYS) {
    if (Object.hasOwn(input, key)) {
      throw new RecipientPreferencesError(
        'consent',
        `Refusing to infer marketing consent from ${key}.`
      );
    }
  }
}

function disabledChannels(): RecipientChannelEnablement {
  return {
    email: false,
    sms: false,
    push: false,
    in_app: false,
  };
}

export function defaultRecipientPreferences(input: {
  betterAuthUserId: string;
  recipientKind: RecipientKind;
  localTimezone?: string;
}): RecipientPreferences {
  const betterAuthUserId = input.betterAuthUserId.trim();
  if (!betterAuthUserId) {
    throw new RecipientPreferencesError(
      'invalid',
      'Better Auth user id is required.'
    );
  }
  if (!RECIPIENT_KINDS.includes(input.recipientKind)) {
    throw new RecipientPreferencesError(
      'invalid',
      'Recipient kind must be tim or customer.'
    );
  }

  const timezone =
    input.recipientKind === 'tim' ? TIM_DEFAULT_TIMEZONE : input.localTimezone;
  if (!timezone || !isIanaTimeZone(timezone)) {
    throw new RecipientPreferencesError(
      'invalid',
      input.recipientKind === 'customer'
        ? 'Customer defaults require a valid local IANA timezone.'
        : 'Tim default timezone is not a valid IANA zone.'
    );
  }

  return {
    version: RECIPIENT_PREFERENCES_VERSION,
    betterAuthUserId,
    recipientKind: input.recipientKind,
    timezone,
    quietHours: {
      start: DEFAULT_QUIET_HOURS_START,
      end: DEFAULT_QUIET_HOURS_END,
    },
    weekendBehavior:
      input.recipientKind === 'tim'
        ? 'weekend_briefing_eligible'
        : 'observe_quiet_hours',
    briefingBehavior: input.recipientKind === 'tim' ? 'weekend_summer' : 'off',
    channels: disabledChannels(),
    marketingOptIn: false,
    marketingConsent: null,
  };
}

export function parseRecipientPreferencesWrite(
  input: unknown
): RecipientPreferences {
  rejectInferredConsentSignals(input);
  const parsed = recipientPreferencesWriteSchema.safeParse(input);
  if (!parsed.success) {
    const consentIssue = parsed.error.issues.some(issue =>
      issue.path.includes('marketingConsent')
    );
    const message = parsed.error.issues[0]?.message ?? 'Invalid preferences.';
    throw new RecipientPreferencesError(
      consentIssue ? 'consent' : 'invalid',
      message
    );
  }

  return {
    version: RECIPIENT_PREFERENCES_VERSION,
    betterAuthUserId: parsed.data.betterAuthUserId,
    recipientKind: parsed.data.recipientKind,
    timezone: parsed.data.timezone,
    quietHours: parsed.data.quietHours,
    weekendBehavior: parsed.data.weekendBehavior,
    briefingBehavior: parsed.data.briefingBehavior,
    channels: parsed.data.channels,
    marketingOptIn: parsed.data.marketingOptIn,
    marketingConsent: parsed.data.marketingConsent,
  };
}

export function toStoredRecipientPreferences(
  preferences: RecipientPreferences
): StoredRecipientPreferences {
  if (preferences.version !== RECIPIENT_PREFERENCES_VERSION) {
    throw new RecipientPreferencesError(
      'version',
      `Recipient preferences version ${preferences.version} is not supported.`
    );
  }

  return {
    betterAuthUserId: preferences.betterAuthUserId,
    preferenceVersion: preferences.version,
    recipientKind: preferences.recipientKind,
    timezone: preferences.timezone,
    quietHoursStart: preferences.quietHours.start,
    quietHoursEnd: preferences.quietHours.end,
    weekendBehavior: preferences.weekendBehavior,
    briefingBehavior: preferences.briefingBehavior,
    channelEmail: preferences.channels.email,
    channelSms: preferences.channels.sms,
    channelPush: preferences.channels.push,
    channelInApp: preferences.channels.in_app,
    marketingOptIn: preferences.marketingOptIn,
    marketingConsentVersion: preferences.marketingConsent?.version ?? null,
    marketingConsentRecordedAt:
      preferences.marketingConsent?.recordedAt ?? null,
  };
}

function isRecipientKind(value: string): value is RecipientKind {
  return (RECIPIENT_KINDS as readonly string[]).includes(value);
}

function isWeekendBehavior(value: string): value is WeekendBehavior {
  return (WEEKEND_BEHAVIORS as readonly string[]).includes(value);
}

function isBriefingBehavior(value: string): value is BriefingBehavior {
  return (BRIEFING_BEHAVIORS as readonly string[]).includes(value);
}

export function fromStoredRecipientPreferences(
  row: StoredRecipientPreferences
): RecipientPreferences {
  if (row.preferenceVersion !== RECIPIENT_PREFERENCES_VERSION) {
    throw new RecipientPreferencesError(
      'version',
      `Recipient preferences version ${row.preferenceVersion} is not supported.`
    );
  }
  if (
    !isRecipientKind(row.recipientKind) ||
    !isWeekendBehavior(row.weekendBehavior) ||
    !isBriefingBehavior(row.briefingBehavior) ||
    !QUIET_HOUR_PATTERN.test(row.quietHoursStart) ||
    !QUIET_HOUR_PATTERN.test(row.quietHoursEnd) ||
    row.quietHoursStart === row.quietHoursEnd ||
    !isIanaTimeZone(row.timezone)
  ) {
    throw new RecipientPreferencesError(
      'invalid',
      'Stored recipient preferences are invalid.'
    );
  }

  const optedIn = row.marketingOptIn;
  const consentVersion = row.marketingConsentVersion;
  const recordedAt = row.marketingConsentRecordedAt;
  const consentComplete =
    consentVersion === MARKETING_CONSENT_VERSION &&
    typeof recordedAt === 'string' &&
    recordedAt.length > 0;
  if (
    optedIn !== consentComplete ||
    (!optedIn && (consentVersion || recordedAt))
  ) {
    throw new RecipientPreferencesError(
      'consent',
      'Stored marketing opt-in does not match an explicit consent record.'
    );
  }

  return {
    version: RECIPIENT_PREFERENCES_VERSION,
    betterAuthUserId: row.betterAuthUserId,
    recipientKind: row.recipientKind,
    timezone: row.timezone,
    quietHours: {
      start: row.quietHoursStart,
      end: row.quietHoursEnd,
    },
    weekendBehavior: row.weekendBehavior,
    briefingBehavior: row.briefingBehavior,
    channels: {
      email: row.channelEmail,
      sms: row.channelSms,
      push: row.channelPush,
      in_app: row.channelInApp,
    },
    marketingOptIn: optedIn,
    marketingConsent: optedIn
      ? {
          version: MARKETING_CONSENT_VERSION,
          recordedAt: recordedAt as string,
        }
      : null,
  };
}

export async function readRecipientPreferences(
  input: {
    betterAuthUserId: string;
    recipientKind: RecipientKind;
    localTimezone?: string;
  },
  store: RecipientPreferencesStore
): Promise<RecipientPreferences> {
  const betterAuthUserId = input.betterAuthUserId.trim();
  if (!betterAuthUserId) {
    throw new RecipientPreferencesError(
      'invalid',
      'Better Auth user id is required.'
    );
  }

  const stored = await store.find(betterAuthUserId);
  if (!stored) {
    return defaultRecipientPreferences({
      betterAuthUserId,
      recipientKind: input.recipientKind,
      localTimezone: input.localTimezone,
    });
  }

  return fromStoredRecipientPreferences(stored);
}

export async function writeRecipientPreferences(
  input: unknown,
  store: RecipientPreferencesStore
): Promise<RecipientPreferences> {
  const preferences = parseRecipientPreferencesWrite(input);
  const existing = await store.find(preferences.betterAuthUserId);
  if (
    existing &&
    existing.preferenceVersion !== RECIPIENT_PREFERENCES_VERSION
  ) {
    throw new RecipientPreferencesError(
      'version',
      `Refusing to overwrite recipient preferences version ${existing.preferenceVersion}.`
    );
  }

  const stored = toStoredRecipientPreferences(preferences);
  await store.save(stored);
  return fromStoredRecipientPreferences(stored);
}
