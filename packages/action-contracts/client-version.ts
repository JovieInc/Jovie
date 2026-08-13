import type { ActionDescriptor } from './descriptor';
import type { ActionChannel } from './invocation';

/**
 * Deterministic client-version gate for discovery and invocation.
 *
 * `minimumClientVersions[channel]` declares the oldest client build that may
 * invoke an action on that channel. The gate fails closed: a missing or
 * malformed `clientVersion` is treated as below the minimum, so an outdated
 * client can never slip through by omitting or mangling its version.
 * Discovery surfaces a gated action as `CLIENT_UPGRADE_REQUIRED`.
 */

const VERSION_SEGMENT = /^\d+$/;

function parseVersion(version: string): readonly number[] | null {
  const segments = version.split('.');
  if (segments.some(segment => !VERSION_SEGMENT.test(segment))) {
    return null;
  }
  return segments.map(segment => Number.parseInt(segment, 10));
}

/**
 * Compare two dotted-numeric versions segment-wise; omitted segments count
 * as 0 (`1.2` equals `1.2.0`). Returns negative/zero/positive ordering.
 * A malformed version sorts below every well-formed version.
 */
export function compareClientVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);
  if (!parsedA || !parsedB) {
    if (parsedA) return 1;
    if (parsedB) return -1;
    return 0;
  }
  const length = Math.max(parsedA.length, parsedB.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (parsedA[index] ?? 0) - (parsedB[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * True when the action declares a minimum client version for this channel
 * and the caller's `clientVersion` is missing, malformed, or below it.
 */
export function isClientUpgradeRequired(
  action: Pick<ActionDescriptor, 'minimumClientVersions'>,
  channel: ActionChannel,
  clientVersion: string | undefined
): boolean {
  const minimum = action.minimumClientVersions?.[channel];
  if (!minimum) return false;
  if (!clientVersion) return true;
  return compareClientVersions(clientVersion, minimum) < 0;
}
