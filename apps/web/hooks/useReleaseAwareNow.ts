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

// JavaScript's setTimeout overflows for delays > 2^31 - 1 ms (~24.8 days).
// Chunk long waits so far-future releases are handled correctly.
const MAX_TIMEOUT_MS = 2_147_483_647;

export function useReleaseAwareNow(
  releaseDate: Date | string | null | undefined
): Date {
  const [now, setNow] = useState<Date>(() => new Date());

  // Compute a stable numeric timestamp so callers that create a new Date
  // object on every render (e.g. `new Date(release.releaseDate)`) do not
  // cause the effect to re-run unnecessarily.
  const releaseTimestamp =
    releaseDate instanceof Date
      ? releaseDate.getTime()
      : releaseDate
        ? new Date(releaseDate).getTime()
        : Number.NaN;

  useEffect(() => {
    // Bail out for null/invalid or already-past dates — no timer needed.
    if (!Number.isFinite(releaseTimestamp)) return;
    const initialMs = releaseTimestamp - Date.now();
    if (initialMs <= 0) return;

    let timeout: ReturnType<typeof setTimeout> | undefined;

    // Chunk long waits so far-future releases (>24.8 days) are handled
    // correctly — setTimeout overflows for delays > 2^31-1 ms.
    const schedule = () => {
      const msUntil = releaseTimestamp - Date.now();
      if (msUntil <= 0) {
        setNow(new Date());
        return;
      }
      timeout = setTimeout(schedule, Math.min(msUntil + 50, MAX_TIMEOUT_MS));
    };

    timeout = setTimeout(schedule, Math.min(initialMs + 50, MAX_TIMEOUT_MS));
    return () => clearTimeout(timeout);
  }, [releaseTimestamp]);

  return now;
}
