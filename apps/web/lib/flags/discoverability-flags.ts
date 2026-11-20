import type { PartialAppFlagSnapshot } from './contracts';
import { DISCOVERABILITY_FLAGS } from './discoverability-defaults';

export { DISCOVERABILITY_FLAGS } from './discoverability-defaults';

/** Default-off Cmd-K doors. Resolve audited overrides on the server and hydrate
 * the existing AppFlagProvider; client code never reads server-only env values.
 * Navigation visibility does not change route authorization.
 */

export type DiscoverabilityFlagName = keyof typeof DISCOVERABILITY_FLAGS;

export function isDiscoverabilityFlagEnabled(
  name: DiscoverabilityFlagName,
  snapshot: PartialAppFlagSnapshot = {}
): boolean {
  return snapshot[name] ?? DISCOVERABILITY_FLAGS[name];
}
