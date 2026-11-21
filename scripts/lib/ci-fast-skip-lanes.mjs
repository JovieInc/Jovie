/**
 * Parse CI_FAST_SKIP_LANE_IDS (comma-separated). Empty/missing → skip nothing.
 * Kept separate from merge-group proof lookup so sparse-checkout consumers of
 * ci-fast-lanes.mjs do not need the GitHub client module.
 * @param {string | undefined} raw
 * @returns {Set<string>}
 */
export function parseSkipLaneIds(raw) {
  const skipped = new Set();
  if (typeof raw !== 'string' || raw.trim() === '') return skipped;
  for (const part of raw.split(',')) {
    const id = part.trim();
    if (id) skipped.add(id);
  }
  return skipped;
}
