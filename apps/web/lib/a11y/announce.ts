/**
 * Polite announcement seam (JOV-9035).
 *
 * The single app-level `aria-live="polite"` region (LiveAnnouncer, tracked as
 * the separate live-announcer job) is the ONLY owner of success
 * announcements: components never mount their own live regions, because
 * duplicate announcements count as a defect. Until LiveAnnouncer lands on
 * main, this module is the integration point — the announcer job registers
 * its region here and every surface announces through `announcePolite`.
 */

export type PoliteAnnouncer = (message: string) => void;

let announcer: PoliteAnnouncer | null = null;
const announcedEventIds = new Set<string>();

/**
 * Register (or clear) the app-level announcer. LiveAnnouncer registers its
 * region's update function on mount; tests register spies to observe messages.
 */
export function registerPoliteAnnouncer(fn: PoliteAnnouncer | null): void {
  announcer = fn;
}

/** Announce one message through the registered app-level live region. */
export function announcePolite(message: string): void {
  announcer?.(message);
}

/**
 * Announce at most once per event id (JOV-9035 ground rule: a peak moment
 * fires once per event). The guard is keyed by the checkout session id, so
 * re-renders, remounts, and repeated validations never duplicate the
 * message within a session. Durable cross-session persistence is owned by
 * the server-side checkout-session validation and lands with LiveAnnouncer.
 *
 * @returns true when this call performed the announcement.
 */
export function announceOncePerEvent(
  eventId: string,
  message: string
): boolean {
  if (announcedEventIds.has(eventId)) return false;
  announcedEventIds.add(eventId);
  announcePolite(message);
  return true;
}

/** Test seam: forget guarded event ids. */
export function resetAnnouncedEventIds(): void {
  announcedEventIds.clear();
}
