/**
 * The shell receives this server-derived summary before the sidebar renders.
 * `unknown` deliberately fails open: a transient data failure must never hide
 * a destination a creator may still need.
 */
export interface InboxNavigationAvailability {
  readonly state: 'available' | 'empty' | 'unknown';
  readonly pendingCount: number | null;
}

export const UNKNOWN_INBOX_NAVIGATION_AVAILABILITY: InboxNavigationAvailability =
  {
    state: 'unknown',
    pendingCount: null,
  };

export function resolveInboxNavigationAvailability(
  pendingSuggestedActionCount: number,
  pendingTourDateCount: number
): InboxNavigationAvailability {
  const pendingCount = pendingSuggestedActionCount + pendingTourDateCount;

  return pendingCount > 0
    ? { state: 'available', pendingCount }
    : { state: 'empty', pendingCount: 0 };
}

export function shouldShowInboxNavigation(
  availability: InboxNavigationAvailability | undefined,
  isActive: boolean
): boolean {
  return isActive || availability?.state !== 'empty';
}
