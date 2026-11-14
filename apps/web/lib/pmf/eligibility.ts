/**
 * Who sees the Sean Ellis product-market-fit prompt, and when.
 *
 * Pure: callers pass `now`, so the rule is testable without a clock.
 * - Only admitted, activated users (see lib/activation/admitted-activation).
 * - Asked once. An answer ends it for good.
 * - A dismissal re-asks at most once, no sooner than 14 days later.
 */

export const PMF_REASK_AFTER_DAYS = 14;
/** The first ask plus one re-ask. A second dismissal ends it. */
export const PMF_MAX_DISMISSALS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PmfSurveyState {
  readonly answeredAt: Date | null;
  readonly dismissCount: number;
  readonly lastDismissedAt: Date | null;
}

export interface PmfSurveyEligibilityInput {
  readonly admitted: boolean;
  readonly activated: boolean;
  /** Null when the user has never answered or dismissed. */
  readonly state: PmfSurveyState | null;
  readonly now: Date;
}

export function isPmfSurveyEligible(input: PmfSurveyEligibilityInput): boolean {
  if (!input.admitted || !input.activated) return false;
  const { state } = input;
  if (!state) return true;
  if (state.answeredAt) return false;
  if (state.dismissCount <= 0) return true;
  if (state.dismissCount >= PMF_MAX_DISMISSALS) return false;
  if (!state.lastDismissedAt) return true;
  return (
    input.now.getTime() - state.lastDismissedAt.getTime() >=
    PMF_REASK_AFTER_DAYS * DAY_MS
  );
}
