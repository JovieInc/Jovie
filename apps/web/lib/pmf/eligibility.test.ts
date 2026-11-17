import { describe, expect, it } from 'vitest';
import {
  isPmfSurveyEligible,
  PMF_REASK_AFTER_DAYS,
  type PmfSurveyState,
} from './eligibility';

const NOW = new Date('2026-11-11T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysBefore = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

function eligible(
  state: PmfSurveyState | null,
  overrides: { admitted?: boolean; activated?: boolean } = {}
) {
  return isPmfSurveyEligible({
    admitted: overrides.admitted ?? true,
    activated: overrides.activated ?? true,
    state,
    now: NOW,
  });
}

describe('isPmfSurveyEligible', () => {
  it('never prompts a user who has not activated', () => {
    expect(eligible(null, { activated: false })).toBe(false);
  });

  it('never prompts a user who was not admitted', () => {
    expect(eligible(null, { admitted: false })).toBe(false);
  });

  it('prompts an admitted, activated user who was never asked', () => {
    expect(eligible(null)).toBe(true);
  });

  it('never asks again once the user answered', () => {
    expect(
      eligible({
        answeredAt: daysBefore(400),
        dismissCount: 0,
        lastDismissedAt: null,
      })
    ).toBe(false);
    expect(
      eligible({
        answeredAt: daysBefore(1),
        dismissCount: 1,
        lastDismissedAt: daysBefore(30),
      })
    ).toBe(false);
  });

  it('waits 14 days after a first dismissal before asking again', () => {
    const dismissedAt = (days: number) => ({
      answeredAt: null,
      dismissCount: 1,
      lastDismissedAt: daysBefore(days),
    });
    expect(eligible(dismissedAt(0))).toBe(false);
    expect(eligible(dismissedAt(PMF_REASK_AFTER_DAYS - 1))).toBe(false);
    expect(
      eligible({
        answeredAt: null,
        dismissCount: 1,
        lastDismissedAt: new Date(NOW.getTime() - 14 * DAY_MS + 1),
      })
    ).toBe(false);
    expect(eligible(dismissedAt(PMF_REASK_AFTER_DAYS))).toBe(true);
    expect(eligible(dismissedAt(60))).toBe(true);
  });

  it('re-asks only once: a second dismissal ends it', () => {
    expect(
      eligible({
        answeredAt: null,
        dismissCount: 2,
        lastDismissedAt: daysBefore(365),
      })
    ).toBe(false);
  });

  it('still requires activation for the 14-day re-ask', () => {
    expect(
      eligible(
        { answeredAt: null, dismissCount: 1, lastDismissedAt: daysBefore(30) },
        { activated: false }
      )
    ).toBe(false);
  });
});
