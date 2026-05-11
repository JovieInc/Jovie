'use client';

import { useEffect, useState } from 'react';

/**
 * Returns a `Date` that re-renders the calling component exactly once when
 * `releaseDate` passes. Use as the `now` argument to
 * `getProfileReleaseVisibility` (or equivalent client-side time checks) so
 * that ISR-cached parents do not get stuck in a "countdown" state after the
 * release has actually dropped.
 *
 * Initial value is `new Date()` at mount. If `releaseDate` is null/invalid
 * or already in the past, no timer is scheduled.
 */
export function useReleaseAwareNow(
  releaseDate: Date | string | null | undefined
): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    if (!releaseDate) return;
    const target =
      releaseDate instanceof Date ? releaseDate : new Date(releaseDate);
    if (Number.isNaN(target.getTime())) return;

    const msUntil = target.getTime() - Date.now();
    if (msUntil <= 0) {
      setNow(new Date());
      return;
    }

    const timeout = setTimeout(() => setNow(new Date()), msUntil + 50);
    return () => clearTimeout(timeout);
  }, [releaseDate]);

  return now;
}
