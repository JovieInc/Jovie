/**
 * The shell receives this server-derived summary before the sidebar renders.
 * `unknown` deliberately fails open: a transient data failure must never hide
 * a destination a creator may still need.
 *
 * Total-versus-page contract: `pendingCount` is the uncapped total of pending
 * work eligible for creator review (see `countPendingCreatorInboxActions`),
 * not the number of cards the Inbox page renders — the feed caps its
 * candidate page, so a badge larger than the rendered card count is
 * expected, never a bug.
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

/**
 * Status literal the Inbox pending-count query filters `suggested_actions` by.
 * Must stay a member of the `suggested_action_status` pg enum — an out-of-enum
 * literal breaks every Inbox load in prod (JOV-3125/JOV-5160 class). Covered
 * by a unit test against `suggestedActionStatusEnum.enumValues`.
 */
export const PENDING_SUGGESTED_ACTION_STATUS = 'pending' as const;

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
  availability: InboxNavigationAvailability | undefined
): boolean {
  return availability?.state !== 'empty';
}

/** Count-aware pending-work label — a lone item stays singular. */
export function formatInboxPendingWorkLabel(pendingCount: number): string {
  return pendingCount === 1
    ? '1 item needs attention'
    : `${pendingCount} items need attention`;
}
