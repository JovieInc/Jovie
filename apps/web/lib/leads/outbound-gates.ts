import {
  OUTREACH_QUIET_HOURS_END_UTC,
  OUTREACH_QUIET_HOURS_START_UTC,
} from './constants';

/**
 * Default-off gate for Instantly enrollment.
 *
 * Unset or any value other than the exact string `true` keeps outbound
 * pushes closed. This does not record consent or rewrite message copy.
 */
export function isInstantlyOutboundEnabled(): boolean {
  return process.env.FEATURE_INSTANTLY_OUTBOUND === 'true';
}

function parseUtcHour(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const hour = Number(value);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fallback;
  return hour;
}

/**
 * Quiet-hours gate for outbound sends. Returns true while the current UTC
 * hour sits inside the quiet window [`start`, `end`), wrapping midnight.
 * No sends may leave during quiet hours, including admin-triggered batches.
 */
export function isOutreachQuietHours(
  now: Date,
  env: Record<string, string | undefined> = process.env
): boolean {
  const start = parseUtcHour(
    env.OUTREACH_QUIET_HOURS_START_UTC,
    OUTREACH_QUIET_HOURS_START_UTC
  );
  const end = parseUtcHour(
    env.OUTREACH_QUIET_HOURS_END_UTC,
    OUTREACH_QUIET_HOURS_END_UTC
  );

  if (start === end) return false;

  const hour = now.getUTCHours();
  return start < end
    ? hour >= start && hour < end
    : hour >= start || hour < end;
}
