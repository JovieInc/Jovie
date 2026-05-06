import type { AudienceMember } from '@/types';

/**
 * Row state for the redesigned audience table.
 *
 * - `high` — actively engaged this week (intentLevel=high or recent + many visits)
 * - `rising` — trending up (medium intent OR ≥3 visits in the last 7 days)
 * - `dormant` — silent for >14 days, never seen, or low signal
 */
export type AudienceRowState = 'high' | 'rising' | 'dormant';

const RISING_VISIT_THRESHOLD = 3;
const RISING_AGE_DAYS = 7;
const DORMANT_AGE_DAYS = 14;
const MS_PER_DAY = 86_400_000;

/**
 * Pure derivation of a row state. Takes `nowMs` as an argument so callers
 * can supply a stable value during SSR (avoiding hydration mismatch) and
 * the real `Date.now()` after mount via the NowMsProvider.
 */
export function deriveAudienceState(
  member: Pick<AudienceMember, 'lastSeenAt' | 'intentLevel' | 'visits'>,
  nowMs: number
): AudienceRowState {
  // Guard against the SSR-context placeholder (nowMs <= 0). Without a real
  // clock we cannot age-bucket, so fall back to a neutral state. Cells that
  // care can detect SSR via isSsrNowMs and pick their own placeholder.
  if (!Number.isFinite(nowMs) || nowMs <= 0) return 'rising';
  if (!member.lastSeenAt) return 'dormant';

  const lastSeenMs = Date.parse(member.lastSeenAt);
  if (Number.isNaN(lastSeenMs)) return 'dormant';

  const ageDays = (nowMs - lastSeenMs) / MS_PER_DAY;

  if (ageDays > DORMANT_AGE_DAYS) return 'dormant';

  const recentlyActive = ageDays <= RISING_AGE_DAYS;

  // High-intent fans only count as "high" when they were also seen recently.
  // A high-intent fan last seen 8-14 days ago has cooled to "rising".
  if (member.intentLevel === 'high' && recentlyActive) return 'high';

  if (
    recentlyActive &&
    (member.intentLevel === 'medium' || member.visits >= RISING_VISIT_THRESHOLD)
  ) {
    return 'rising';
  }

  // Past the rising window but inside the dormant cutoff (8-14d) — treat
  // high-intent and visited fans as "rising" so we don't lose them in the gap.
  if (
    member.intentLevel === 'high' ||
    member.visits >= RISING_VISIT_THRESHOLD
  ) {
    return 'rising';
  }

  return 'dormant';
}
