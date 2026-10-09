import type { InHouseResolution } from '../in-house-contracts';

/** A saved resolution is the only success. Ambiguous, empty, and upstream states are not. */
export function resolutionIsSuccess(
  result: Pick<InHouseResolution, 'status' | 'links'>
): boolean {
  return result.status === 'resolved' && result.links.length > 0;
}
