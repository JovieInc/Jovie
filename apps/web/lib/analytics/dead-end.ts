'use client';

import { track } from '@/lib/analytics';

/**
 * JOV-INV-046 runtime telemetry. A dead end is a control or message that
 * tells a user a feature cannot work here. The goal is zero of these; when one
 * still reaches a user, record it once per session so Summer can find the
 * surface. `surface` is a stable slug (e.g. `onboarding-turnstile`), `reason`
 * a short machine token (e.g. `browser-unsupported`).
 */
const seen = new Set<string>();

export function trackDeadEndShown(surface: string, reason: string): void {
  const key = `${surface}:${reason}`;
  if (seen.has(key)) return;
  seen.add(key);
  track('dead_end_shown', {
    surface,
    reason,
    path: globalThis.window?.location?.pathname,
  });
}

/** Test seam: clears the once-per-session memory. */
export function resetDeadEndShownForTests(): void {
  seen.clear();
}
