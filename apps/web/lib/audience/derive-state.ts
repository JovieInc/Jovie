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
  if (!member.lastSeenAt) return 'dormant';

  const lastSeenMs = Date.parse(member.lastSeenAt);
  if (Number.isNaN(lastSeenMs)) return 'dormant';

  const ageDays = (nowMs - lastSeenMs) / MS_PER_DAY;

  if (ageDays > DORMANT_AGE_DAYS) return 'dormant';
  if (member.intentLevel === 'high') return 'high';

  const recentlyActive = ageDays <= RISING_AGE_DAYS;
  if (
    recentlyActive &&
    (member.intentLevel === 'medium' || member.visits >= RISING_VISIT_THRESHOLD)
  ) {
    return 'rising';
  }

  return 'dormant';
}
