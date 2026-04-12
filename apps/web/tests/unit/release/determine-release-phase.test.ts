import { describe, expect, it } from 'vitest';
import { determineReleasePhase } from '@/lib/discography/release-phase';
import { DATES, FIXED_NOW } from '../fixtures/release-dates';

describe('determineReleasePhase', () => {
  const now = FIXED_NOW;

  it('returns mystery when revealDate is in the future', () => {
    expect(determineReleasePhase(DATES.futureRelease, DATES.futureReveal, now)).toBe('mystery');
  });

  it('returns revealed when revealDate has passed but releaseDate is in the future', () => {
    expect(determineReleasePhase(DATES.futureRelease, DATES.pastReveal, now)).toBe('revealed');
  });

  it('returns released when releaseDate has passed', () => {
    expect(determineReleasePhase(DATES.pastRelease, '2025-11-01', now)).toBe('released');
  });

  it('returns revealed when revealDate is null and releaseDate is in the future', () => {
    expect(determineReleasePhase(DATES.futureRelease, null, now)).toBe('revealed');
  });

  it('returns released when both dates are null', () => {
    expect(determineReleasePhase(null, null, now)).toBe('released');
  });

  it('returns released when revealDate is past and releaseDate is null', () => {
    expect(determineReleasePhase(null, DATES.pastReveal, now)).toBe('released');
  });

  it('accepts Date objects', () => {
    expect(
      determineReleasePhase(new Date(DATES.futureRelease), new Date(DATES.futureReveal), now)
    ).toBe('mystery');
  });

  it('returns released when releaseDate equals now', () => {
    expect(
      determineReleasePhase('2026-04-11T12:00:00Z', DATES.pastReveal, now)
    ).toBe('released');
  });
});
