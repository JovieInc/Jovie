import {
  isIanaTimeZone,
  QUIET_HOUR_PATTERN,
  type RecipientChannelEnablement,
  type RecipientPreferences,
} from './recipient-preferences';

/**
 * The only quiet-hours decision point for human-facing notifications.
 *
 * Callers provide an explicit clock so the result is deterministic. They must
 * execute the returned action rather than interpreting recipient-local time,
 * urgency, expiry, or bypass rules themselves.
 *
 * JOV-6140.
 */

export const ATTENTION_MESSAGE_CLASSES = [
  'transactional',
  'operational',
  'marketing',
] as const;

export const ATTENTION_URGENCIES = ['routine', 'urgent', 'critical'] as const;

export type AttentionMessageClass = (typeof ATTENTION_MESSAGE_CLASSES)[number];
export type AttentionUrgency = (typeof ATTENTION_URGENCIES)[number];
export type AttentionChannel = keyof RecipientChannelEnablement;
export type AttentionBlock = 'quiet-window' | 'weekend';

export interface CriticalBypassRequest {
  /** Why waiting would cause materially greater harm than interrupting now. */
  readonly justification: string;
}

export interface AttentionPolicyInput {
  readonly preferences: RecipientPreferences;
  readonly messageClass: AttentionMessageClass;
  readonly urgency: AttentionUrgency;
  readonly channel: AttentionChannel;
  readonly now: Date;
  readonly expiresAt: Date | null;
  readonly dedupeIdentity: string;
  readonly criticalBypass: CriticalBypassRequest | null;
}

export type AttentionPolicyDecision =
  | {
      readonly action: 'deliver-now';
      readonly reason: 'allowed-window' | 'critical-bypass';
      readonly dedupeIdentity: string;
      readonly bypassed: boolean;
    }
  | {
      readonly action: 'defer-until';
      readonly reason: AttentionBlock;
      readonly dedupeIdentity: string;
      readonly until: Date;
    }
  | {
      readonly action: 'aggregate';
      readonly reason: AttentionBlock;
      readonly aggregationKey: string;
      readonly until: Date;
    }
  | {
      readonly action: 'suppress';
      readonly reason:
        | 'channel-disabled'
        | 'expired'
        | 'expires-before-next-window'
        | 'invalid-policy-input'
        | 'marketing-opt-in-required';
    };

const MINUTE_MS = 60_000;
const MESSAGE_CLASS_SET = new Set<string>(ATTENTION_MESSAGE_CLASSES);
const URGENCY_SET = new Set<string>(ATTENTION_URGENCIES);
const WEEKEND_BEHAVIOR_SET = new Set<string>([
  'observe_quiet_hours',
  'weekend_briefing_eligible',
  'suppress_weekends',
]);
const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
const localClocks = new Map<string, Intl.DateTimeFormat>();

function localClockFor(timeZone: string): Intl.DateTimeFormat {
  const existing = localClocks.get(timeZone);
  if (existing) return existing;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  localClocks.set(timeZone, formatter);
  return formatter;
}

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

function localParts(
  instant: Date,
  timeZone: string
): { readonly weekday: number; readonly minutes: number } {
  const parts = localClockFor(timeZone).formatToParts(instant);
  const weekdayName = (
    parts.find(part => part.type === 'weekday') as Intl.DateTimeFormatPart
  ).value;
  const hour = Number(
    (parts.find(part => part.type === 'hour') as Intl.DateTimeFormatPart).value
  );
  const minute = Number(
    (parts.find(part => part.type === 'minute') as Intl.DateTimeFormatPart)
      .value
  );
  const weekday = WEEKDAY_INDEX[weekdayName] as number;
  return { weekday, minutes: (hour % 24) * 60 + minute };
}

function isQuietMinute(minutes: number, start: number, end: number): boolean {
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

function attentionBlockAt(
  preferences: RecipientPreferences,
  instant: Date
): AttentionBlock | null {
  const local = localParts(instant, preferences.timezone);
  if (
    preferences.weekendBehavior === 'suppress_weekends' &&
    (local.weekday === 0 || local.weekday === 6)
  ) {
    return 'weekend';
  }

  const start = toMinutes(preferences.quietHours.start);
  const end = toMinutes(preferences.quietHours.end);
  return isQuietMinute(local.minutes, start, end) ? 'quiet-window' : null;
}

function nextAllowedInstant(
  preferences: RecipientPreferences,
  from: Date
): Date {
  const firstMinute = Math.floor(from.getTime() / MINUTE_MS) * MINUTE_MS;
  // Valid preferences always expose at least one allowed minute per weekday,
  // so this reaches a result within three local days even across DST changes.
  for (let offset = 1; ; offset += 1) {
    const candidate = new Date(firstMinute + offset * MINUTE_MS);
    if (attentionBlockAt(preferences, candidate) === null) return candidate;
  }
}

function hasValidPreferences(preferences: RecipientPreferences): boolean {
  return (
    isIanaTimeZone(preferences.timezone) &&
    QUIET_HOUR_PATTERN.test(preferences.quietHours.start) &&
    QUIET_HOUR_PATTERN.test(preferences.quietHours.end) &&
    preferences.quietHours.start !== preferences.quietHours.end &&
    WEEKEND_BEHAVIOR_SET.has(preferences.weekendBehavior)
  );
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function canUseCriticalBypass(input: AttentionPolicyInput): boolean {
  return (
    input.messageClass === 'transactional' &&
    input.urgency === 'critical' &&
    (input.criticalBypass?.justification.trim().length ?? 0) > 0
  );
}

export function evaluateAttentionPolicy(
  input: AttentionPolicyInput
): AttentionPolicyDecision {
  const dedupeIdentity = input.dedupeIdentity.trim();
  if (
    !dedupeIdentity ||
    !isValidDate(input.now) ||
    (input.expiresAt !== null && !isValidDate(input.expiresAt)) ||
    !MESSAGE_CLASS_SET.has(input.messageClass) ||
    !URGENCY_SET.has(input.urgency) ||
    !hasValidPreferences(input.preferences)
  ) {
    return { action: 'suppress', reason: 'invalid-policy-input' };
  }

  if (!input.preferences.channels[input.channel]) {
    return { action: 'suppress', reason: 'channel-disabled' };
  }
  if (input.messageClass === 'marketing' && !input.preferences.marketingOptIn) {
    return { action: 'suppress', reason: 'marketing-opt-in-required' };
  }
  if (input.expiresAt && input.expiresAt.getTime() <= input.now.getTime()) {
    return { action: 'suppress', reason: 'expired' };
  }

  const block = attentionBlockAt(input.preferences, input.now);
  if (block === null) {
    return {
      action: 'deliver-now',
      reason: 'allowed-window',
      dedupeIdentity,
      bypassed: false,
    };
  }

  if (canUseCriticalBypass(input)) {
    return {
      action: 'deliver-now',
      reason: 'critical-bypass',
      dedupeIdentity,
      bypassed: true,
    };
  }

  const until = nextAllowedInstant(input.preferences, input.now);
  if (input.expiresAt && input.expiresAt.getTime() <= until.getTime()) {
    return {
      action: 'suppress',
      reason: 'expires-before-next-window',
    };
  }

  if (input.messageClass === 'operational') {
    return {
      action: 'aggregate',
      reason: block,
      aggregationKey: dedupeIdentity,
      until,
    };
  }

  return {
    action: 'defer-until',
    reason: block,
    dedupeIdentity,
    until,
  };
}
