import { describe, expect, it } from 'vitest';
import { determineReleasePhase } from '@/app/[username]/[slug]/_lib/release-phase';

describe('determineReleasePhase', () => {
  const now = new Date('2025-06-15T12:00:00Z');

  it('returns mystery when revealDate is in the future', () => {
    expect(determineReleasePhase('2025-07-15', '2025-06-20', now)).toBe(
      'mystery'
    );
  });

  it('returns revealed when revealDate has passed but releaseDate is in the future', () => {
    expect(determineReleasePhase('2025-07-15', '2025-06-10', now)).toBe(
      'revealed'
    );
  });

  it('returns released when releaseDate has passed', () => {
    expect(determineReleasePhase('2025-06-01', '2025-05-01', now)).toBe(
      'released'
    );
  });

  it('returns revealed when revealDate is null and releaseDate is in the future (backwards compat)', () => {
    expect(determineReleasePhase('2025-07-15', null, now)).toBe('revealed');
  });

  it('returns released when both dates are null', () => {
    expect(determineReleasePhase(null, null, now)).toBe('released');
  });

  it('returns released when revealDate is past and releaseDate is null (safe fallback)', () => {
    expect(determineReleasePhase(null, '2025-06-01', now)).toBe('released');
  });

  it('accepts Date objects', () => {
    expect(
      determineReleasePhase(new Date('2025-07-15'), new Date('2025-06-20'), now)
    ).toBe('mystery');
  });

  it('returns released when releaseDate is today', () => {
    expect(
      determineReleasePhase('2025-06-15T12:00:00Z', '2025-06-10', now)
    ).toBe('released');
  });
});
