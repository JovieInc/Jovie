import { describe, expect, it } from 'vitest';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';
import { DATES, FIXED_NOW } from '../../fixtures/release-dates';

const ARTWORK_URL = 'https://cdn.jov.ie/releases/test-artwork.jpg';

function release(
  overrides: Partial<{
    releaseDate: Date | string | null;
    revealDate: Date | string | null;
    artworkUrl: string | null;
    status: string | null;
    deletedAt: Date | string | null;
  }>
) {
  return {
    releaseDate: DATES.recentRelease,
    revealDate: DATES.pastReveal,
    artworkUrl: ARTWORK_URL,
    ...overrides,
  };
}

describe('getProfileReleaseVisibility', () => {
  const now = FIXED_NOW;

  it('returns null when release is null', () => {
    expect(getProfileReleaseVisibility(null, null, now)).toBeNull();
  });

  it('returns null when release is undefined', () => {
    expect(getProfileReleaseVisibility(undefined, null, now)).toBeNull();
  });

  it('returns null when release is in mystery phase', () => {
    expect(
      getProfileReleaseVisibility(
        release({
          releaseDate: DATES.futureRelease,
          revealDate: DATES.futureReveal,
        }),
        null,
        now
      )
    ).toBeNull();
  });

  it('returns isCountdown: true when release is in revealed phase', () => {
    const result = getProfileReleaseVisibility(
      release({
        releaseDate: DATES.futureRelease,
        revealDate: DATES.pastReveal,
      }),
      null,
      now
    );
    expect(result).toEqual({
      show: true,
      isCountdown: true,
      isRetired: false,
    });
  });

  it('hides a future release without an announce date', () => {
    expect(
      getProfileReleaseVisibility(
        release({
          releaseDate: DATES.futureRelease,
          revealDate: null,
        }),
        null,
        now
      )
    ).toBeNull();
  });

  it('returns show: true for a released release within 90 days', () => {
    const result = getProfileReleaseVisibility(
      release({
        releaseDate: DATES.recentRelease,
        revealDate: '2026-03-01',
      }),
      null,
      now
    );
    expect(result).toEqual({
      show: true,
      isCountdown: false,
      isRetired: false,
    });
  });

  it('returns show: false, isRetired: true for a release older than 90 days', () => {
    const result = getProfileReleaseVisibility(
      release({
        releaseDate: DATES.retiredRelease,
        revealDate: '2025-11-15',
      }),
      null,
      now
    );
    expect(result).toEqual({
      show: false,
      isCountdown: false,
      isRetired: true,
    });
  });

  it('returns show: true when release is older than 90 days but showOldReleases is true', () => {
    const result = getProfileReleaseVisibility(
      release({
        releaseDate: DATES.retiredRelease,
        revealDate: '2025-11-15',
      }),
      { showOldReleases: true },
      now
    );
    expect(result).toEqual({
      show: true,
      isCountdown: false,
      isRetired: false,
    });
  });

  it('hides release at exactly 91 days old', () => {
    const result = getProfileReleaseVisibility(
      release({
        releaseDate: '2026-01-10T12:00:00Z',
        revealDate: null,
      }),
      null,
      now
    );
    expect(result).toEqual({
      show: false,
      isCountdown: false,
      isRetired: true,
    });
  });

  it('shows release at exactly 89 days old', () => {
    const result = getProfileReleaseVisibility(
      release({
        releaseDate: '2026-01-12T12:00:00Z',
        revealDate: null,
      }),
      null,
      now
    );
    expect(result).toEqual({
      show: true,
      isCountdown: false,
      isRetired: false,
    });
  });

  it('hides releases without a release date', () => {
    expect(
      getProfileReleaseVisibility(
        release({
          releaseDate: null,
          revealDate: null,
        }),
        null,
        now
      )
    ).toBeNull();
  });

  it('hides releases without artwork', () => {
    expect(
      getProfileReleaseVisibility(
        release({
          artworkUrl: null,
        }),
        null,
        now
      )
    ).toBeNull();
  });

  it('hides draft releases', () => {
    expect(
      getProfileReleaseVisibility(
        release({
          status: 'draft',
        }),
        null,
        now
      )
    ).toBeNull();
  });

  it('hides deleted releases', () => {
    expect(
      getProfileReleaseVisibility(
        release({
          deletedAt: '2026-04-01T00:00:00Z',
        }),
        null,
        now
      )
    ).toBeNull();
  });

  it('accepts Date objects for release dates', () => {
    const result = getProfileReleaseVisibility(
      release({
        releaseDate: new Date('2026-06-01'),
        revealDate: new Date('2026-04-01'),
      }),
      null,
      now
    );
    expect(result).toEqual({
      show: true,
      isCountdown: true,
      isRetired: false,
    });
  });

  it('handles undefined settings the same as null', () => {
    const result = getProfileReleaseVisibility(
      release({
        releaseDate: DATES.retiredRelease,
        revealDate: null,
      }),
      undefined,
      now
    );
    expect(result).toEqual({
      show: false,
      isCountdown: false,
      isRetired: true,
    });
  });
});
