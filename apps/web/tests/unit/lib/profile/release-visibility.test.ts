import { describe, expect, it } from 'vitest';
import { getProfileReleaseVisibility } from '@/lib/profile/release-visibility';

describe('getProfileReleaseVisibility', () => {
  const now = new Date('2026-04-11T12:00:00Z');

  it('returns null when release is null', () => {
    expect(getProfileReleaseVisibility(null, null, now)).toBeNull();
  });

  it('returns null when release is undefined', () => {
    expect(getProfileReleaseVisibility(undefined, null, now)).toBeNull();
  });

  it('returns null when release is in mystery phase', () => {
    const release = {
      releaseDate: '2026-06-01',
      revealDate: '2026-05-01', // still in the future
    };
    expect(getProfileReleaseVisibility(release, null, now)).toBeNull();
  });

  it('returns isCountdown: true when release is in revealed phase', () => {
    const release = {
      releaseDate: '2026-06-01', // future
      revealDate: '2026-04-01', // already passed
    };
    const result = getProfileReleaseVisibility(release, null, now);
    expect(result).toEqual({
      show: true,
      isCountdown: true,
      isRetired: false,
    });
  });

  it('returns isCountdown: true when revealDate is null and releaseDate is in the future', () => {
    const release = {
      releaseDate: '2026-06-01', // future
      revealDate: null,
    };
    const result = getProfileReleaseVisibility(release, null, now);
    expect(result).toEqual({
      show: true,
      isCountdown: true,
      isRetired: false,
    });
  });

  it('returns show: true for a released release within 90 days', () => {
    const release = {
      releaseDate: '2026-03-15', // 27 days ago
      revealDate: '2026-03-01',
    };
    const result = getProfileReleaseVisibility(release, null, now);
    expect(result).toEqual({
      show: true,
      isCountdown: false,
      isRetired: false,
    });
  });

  it('returns show: false, isRetired: true for a release older than 90 days', () => {
    const release = {
      releaseDate: '2025-12-01', // ~131 days ago
      revealDate: '2025-11-15',
    };
    const result = getProfileReleaseVisibility(release, null, now);
    expect(result).toEqual({
      show: false,
      isCountdown: false,
      isRetired: true,
    });
  });

  it('returns show: true when release is older than 90 days but showOldReleases is true', () => {
    const release = {
      releaseDate: '2025-12-01', // ~131 days ago
      revealDate: '2025-11-15',
    };
    const result = getProfileReleaseVisibility(
      release,
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
    // 91 days before now = 2026-01-10T12:00:00Z
    const release = {
      releaseDate: '2026-01-10T12:00:00Z',
      revealDate: null,
    };
    const result = getProfileReleaseVisibility(release, null, now);
    expect(result).toEqual({
      show: false,
      isCountdown: false,
      isRetired: true,
    });
  });

  it('shows release at exactly 89 days old', () => {
    // 89 days before now = 2026-01-12T12:00:00Z
    const release = {
      releaseDate: '2026-01-12T12:00:00Z',
      revealDate: null,
    };
    const result = getProfileReleaseVisibility(release, null, now);
    expect(result).toEqual({
      show: true,
      isCountdown: false,
      isRetired: false,
    });
  });

  it('treats null releaseDate as non-retired (show: true)', () => {
    const release = {
      releaseDate: null,
      revealDate: null,
    };
    const result = getProfileReleaseVisibility(release, null, now);
    expect(result).toEqual({
      show: true,
      isCountdown: false,
      isRetired: false,
    });
  });

  it('accepts Date objects for release dates', () => {
    const release = {
      releaseDate: new Date('2026-06-01'),
      revealDate: new Date('2026-04-01'),
    };
    const result = getProfileReleaseVisibility(release, null, now);
    expect(result).toEqual({
      show: true,
      isCountdown: true,
      isRetired: false,
    });
  });

  it('handles undefined settings the same as null', () => {
    const release = {
      releaseDate: '2025-12-01',
      revealDate: null,
    };
    const result = getProfileReleaseVisibility(release, undefined, now);
    expect(result).toEqual({
      show: false,
      isCountdown: false,
      isRetired: true,
    });
  });
});
