/**
 * Action Constants
 *
 * Shared constants for user actions and interactions.
 * Used for activity tracking, notifications, and analytics.
 */

/**
 * Icons for different action types.
 * Used in activity feeds, notifications, and analytics displays.
 */
export const ACTION_ICONS: Record<string, string> = {
  listen: '🎧',
  social: '📸',
  tip: '💸',
  other: '🔗',
} as const;

/**
 * Human-readable labels for action types.
 * Used to describe what the user did in activity feeds.
 */
export const ACTION_LABELS: Record<string, string> = {
  listen: 'listened',
  social: 'tapped a social link',
  tip: 'sent a tip',
  other: 'clicked a link',
} as const;

/**
 * Get the icon for an action type with a fallback.
 * @param linkType - The type of link/action
 * @returns The emoji icon for the action
 */
export function getActionIcon(linkType: string): string {
  return ACTION_ICONS[linkType] ?? '⭐';
}

/**
 * Get the label for an action type with a fallback.
 * @param linkType - The type of link/action
 * @returns The human-readable label for the action
 */
export function getActionLabel(linkType: string): string {
  return ACTION_LABELS[linkType] ?? 'interacted';
}
