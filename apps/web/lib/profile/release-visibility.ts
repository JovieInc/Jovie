import { determineReleasePhase } from '@/lib/discography/release-phase';

const RETIREMENT_DAYS = 90;

export interface ProfileReleaseVisibility {
  show: boolean;
  /** true when phase === 'revealed' (future releaseDate, revealDate passed) */
  isCountdown: boolean;
  /** true when release is older than 90 days */
  isRetired: boolean;
}

/**
 * Determines whether and how the latest release card should display
 * on an artist's public profile page.
 *
 * Returns null when there is no release to show at all.
 */
export function getProfileReleaseVisibility(
  release:
    | {
        releaseDate: Date | string | null;
        revealDate?: Date | string | null;
      }
    | null
    | undefined,
  settings: { showOldReleases?: boolean } | null | undefined,
  now?: Date
): ProfileReleaseVisibility | null {
  if (!release) return null;

  const currentTime = now ?? new Date();
  const phase = determineReleasePhase(
    release.releaseDate,
    release.revealDate,
    currentTime
  );

  // Mystery phase: should never reach here (query filters it), but guard defensively
  if (phase === 'mystery') return null;

  // Revealed phase: show with countdown
  if (phase === 'revealed') {
    return { show: true, isCountdown: true, isRetired: false };
  }

  // Released phase: check 90-day retirement
  if (release.releaseDate) {
    const releaseTime = new Date(release.releaseDate).getTime();
    const daysSinceRelease =
      (currentTime.getTime() - releaseTime) / (1000 * 60 * 60 * 24);
    if (
      daysSinceRelease > RETIREMENT_DAYS &&
      settings?.showOldReleases !== true
    ) {
      return { show: false, isCountdown: false, isRetired: true };
    }
  }

  return { show: true, isCountdown: false, isRetired: false };
}
