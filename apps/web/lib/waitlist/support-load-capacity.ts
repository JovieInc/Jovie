/**
 * Support-load capacity (Tim, 2026-11-09): "gate harder when bug reports or
 * support load is high". Pure: the caller counts open verifiable bug reports
 * and passes the stored daily auto-accept limit; this returns the limit that
 * admission may use today. Fails closed: an unreadable count narrows.
 *
 * Demand already narrows admission through the ranked queue (best leads first,
 * `isOutrankedByQueue`), so this module only covers how much the team can
 * support right now.
 */

/** Open verifiable bug reports in the window at which the daily limit halves. */
export const SUPPORT_LOAD_NARROW_AT = 4;
/** Open verifiable bug reports at which admission pauses until they clear. */
export const SUPPORT_LOAD_HOLD_AT = 10;
/** Only recent reports count: an old backlog should not freeze admission. */
export const SUPPORT_LOAD_WINDOW_DAYS = 7;

export type SupportLoadBand = 'normal' | 'narrow' | 'hold';

export interface SupportLoadCapacity {
  readonly band: SupportLoadBand;
  readonly dailyLimit: number;
}

export function decideSupportLoadCapacity(input: {
  readonly baseDailyLimit: number;
  readonly openBugReports: number | null;
}): SupportLoadCapacity {
  const base = Math.max(0, Math.trunc(input.baseDailyLimit));
  const open = input.openBugReports;
  if (open !== null && Number.isFinite(open) && open >= SUPPORT_LOAD_HOLD_AT) {
    return { band: 'hold', dailyLimit: 0 };
  }
  if (
    open === null ||
    !Number.isFinite(open) ||
    open >= SUPPORT_LOAD_NARROW_AT
  ) {
    return { band: 'narrow', dailyLimit: Math.floor(base / 2) };
  }
  return { band: 'normal', dailyLimit: base };
}
