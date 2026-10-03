import type {
  RecipientChannelEnablement,
  RecipientPreferences,
} from './recipient-preferences';

/**
 * Canonical attention-policy evaluator.
 *
 * One decision point for whether a notification may interrupt a person right
 * now. Jovie may interrupt during quiet hours only when delaying until the
 * next allowed window would create materially greater harm than the
 * interruption — expressed here as a transactional bypass that requires an
 * explicit justification. Marketing never bypasses quiet hours and always
 * requires opt-in. Local time and consent come from the recipient's stored
 * preferences, never the server clock.
 *
 * JOV-6140.
 */

export const ATTENTION_CLASSES = [
  'transactional',
  'operational',
  'marketing',
] as const;

export type AttentionClass = (typeof ATTENTION_CLASSES)[number];

export type AttentionChannel = keyof RecipientChannelEnablement;

export type AttentionBlock = 'quiet_hours' | 'weekend_suppression';

export type AttentionDecision =
  | { action: 'deliver'; bypassed: boolean }
  | {
      action: 'defer';
      reason: AttentionBlock;
      deliverAt: Date;
    }
  | {
      action: 'suppress';
      reason: 'channel_disabled' | 'marketing_opt_in_required';
    };

export interface AttentionBypass {
  /**
   * Why delaying until the next allowed window would create materially
   * greater harm than interrupting now. Required for a transactional bypass;
   * ignored for every other class.
   */
  justification: string;
}

export interface AttentionRequest {
  notificationClass: AttentionClass;
  channel: AttentionChannel;
  preferences: RecipientPreferences;
  now?: Date;
  bypass?: AttentionBypass;
}

const MAX_DEFER_MINUTES = 8 * 24 * 60;

const localClocks = new Map<string, Intl.DateTimeFormat>();

function localClockFor(timeZone: string): Intl.DateTimeFormat {
  let clock = localClocks.get(timeZone);
  if (!clock) {
    clock = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    localClocks.set(timeZone, clock);
  }
  return clock;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function toMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

function localParts(
  instant: Date,
  timeZone: string
): { weekday: number; minutes: number } {
  const parts = localClockFor(timeZone).formatToParts(instant);
  let weekday = '';
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'weekday') weekday = part.value;
    else if (part.type === 'hour') hour = Number(part.value);
    else if (part.type === 'minute') minute = Number(part.value);
  }
  return {
    weekday: WEEKDAY_INDEX[weekday] ?? 0,
    minutes: (hour % 24) * 60 + minute,
  };
}

function inQuietHours(minutes: number, start: number, end: number): boolean {
  // Windows may wrap midnight (e.g. 21:00–08:00).
  return start < end
    ? minutes >= start && minutes < end
    : minutes >= start || minutes < end;
}

export function attentionBlockAt(
  preferences: RecipientPreferences,
  notificationClass: AttentionClass,
  instant: Date
): AttentionBlock | null {
  const { weekday, minutes } = localParts(instant, preferences.timezone);
  if (
    preferences.weekendBehavior === 'suppress_weekends' &&
    notificationClass !== 'transactional' &&
    (weekday === 0 || weekday === 6)
  ) {
    return 'weekend_suppression';
  }
  const start = toMinutes(preferences.quietHours.start);
  const end = toMinutes(preferences.quietHours.end);
  if (inQuietHours(minutes, start, end)) {
    return 'quiet_hours';
  }
  return null;
}

function nextAllowedInstant(
  preferences: RecipientPreferences,
  notificationClass: AttentionClass,
  from: Date
): Date {
  // Scan forward one local minute at a time; DST transitions and weekend
  // boundaries fall out of the per-instant check. Bounded so a pathological
  // preference row cannot loop forever.
  for (let offset = 1; offset <= MAX_DEFER_MINUTES; offset++) {
    const candidate = new Date(from.getTime() + offset * 60_000);
    if (attentionBlockAt(preferences, notificationClass, candidate) === null) {
      return candidate;
    }
  }
  return new Date(from.getTime() + MAX_DEFER_MINUTES * 60_000);
}

export function evaluateAttention(
  request: AttentionRequest
): AttentionDecision {
  const { notificationClass, channel, preferences } = request;
  const now = request.now ?? new Date();

  if (!preferences.channels[channel]) {
    return { action: 'suppress', reason: 'channel_disabled' };
  }
  if (notificationClass === 'marketing' && !preferences.marketingOptIn) {
    return { action: 'suppress', reason: 'marketing_opt_in_required' };
  }

  const block = attentionBlockAt(preferences, notificationClass, now);
  if (block === null) {
    return { action: 'deliver', bypassed: false };
  }

  if (
    notificationClass === 'transactional' &&
    typeof request.bypass?.justification === 'string' &&
    request.bypass.justification.trim().length > 0
  ) {
    return { action: 'deliver', bypassed: true };
  }

  return {
    action: 'defer',
    reason: block,
    deliverAt: nextAllowedInstant(preferences, notificationClass, now),
  };
}
