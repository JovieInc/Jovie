import { APP_FLAG_DEFAULTS, type PartialAppFlagSnapshot } from './contracts';

/** Default-off Cmd-K doors. Resolve audited overrides on the server and hydrate
 * the existing AppFlagProvider; client code never reads server-only env values.
 * Navigation visibility does not change route authorization.
 */
export const DISCOVERABILITY_FLAGS = {
  YOUTUBE_WORKSPACE_NAV: APP_FLAG_DEFAULTS.YOUTUBE_WORKSPACE_NAV,
  JOVIE_WORK_NAV: APP_FLAG_DEFAULTS.JOVIE_WORK_NAV,
} as const;

export type DiscoverabilityFlagName = keyof typeof DISCOVERABILITY_FLAGS;

export function isDiscoverabilityFlagEnabled(
  name: DiscoverabilityFlagName,
  snapshot: PartialAppFlagSnapshot = {}
): boolean {
  return snapshot[name] ?? DISCOVERABILITY_FLAGS[name];
}
