/**
 * Default-off doors for shipped workspaces Tim has not approved for navigation.
 *
 * Override with FEATURE_<FLAG_NAME>=true. These flags only show or hide
 * Cmd-K rows. They do not change route auth.
 */

export const DISCOVERABILITY_FLAGS = {
  /** Cmd-K for /app/youtube. The revival queue is real; generation stays off. */
  YOUTUBE_WORKSPACE_NAV: false,
  /** Cmd-K for /app/jovie-work. Agent-shipped feed, not a founder-approved rail item. */
  JOVIE_WORK_NAV: false,
} as const satisfies Record<string, boolean>;

export type DiscoverabilityFlagName = keyof typeof DISCOVERABILITY_FLAGS;

export function isDiscoverabilityFlagEnabled(
  name: DiscoverabilityFlagName
): boolean {
  if (typeof process === 'undefined' || !process.env) {
    return DISCOVERABILITY_FLAGS[name];
  }
  const envVal = process.env[`FEATURE_${name}`];
  if (envVal === 'true') return true;
  if (envVal === 'false') return false;
  return DISCOVERABILITY_FLAGS[name];
}
