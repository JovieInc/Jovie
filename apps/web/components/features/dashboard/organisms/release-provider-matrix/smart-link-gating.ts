import type { ReleaseViewModel } from '@/lib/discography/types';

/** Soft cap: show a "request higher limit" banner, not a hard lock. */
export const SMART_LINK_SOFT_CAP = 100;

export type SmartLinkLockReason = 'scheduled' | 'cap';

export interface SmartLinkGating {
  readonly unlockedIds: Set<string> | null;
  readonly lockReasons: Map<string, SmartLinkLockReason>;
  readonly releasedCount: number;
  readonly unreleasedCount: number;
}

export function computeSmartLinkGating(
  rows: readonly ReleaseViewModel[],
  smartLinksLimit: number | null | undefined,
  canAccessFutureReleases: boolean
): SmartLinkGating {
  const now = Date.now();
  const released: ReleaseViewModel[] = [];
  const unreleased: ReleaseViewModel[] = [];
  const reasons = new Map<string, SmartLinkLockReason>();

  for (const release of rows) {
    const releaseTime = release.releaseDate
      ? new Date(release.releaseDate).getTime()
      : 0;
    if (releaseTime > now) {
      unreleased.push(release);
      if (!canAccessFutureReleases) reasons.set(release.id, 'scheduled');
    } else {
      released.push(release);
    }
  }

  if (!smartLinksLimit) {
    return {
      unlockedIds: canAccessFutureReleases
        ? null
        : new Set(released.map(release => release.id)),
      lockReasons: reasons,
      releasedCount: released.length,
      unreleasedCount: unreleased.length,
    };
  }

  const sortedReleased = [...released].sort((a, b) => {
    const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
    const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
    return dateA - dateB;
  });
  const unlockedIds = new Set(
    sortedReleased.slice(0, smartLinksLimit).map(release => release.id)
  );

  for (const release of sortedReleased.slice(smartLinksLimit)) {
    reasons.set(release.id, 'cap');
  }

  return {
    unlockedIds,
    lockReasons: reasons,
    releasedCount: released.length,
    unreleasedCount: unreleased.length,
  };
}
