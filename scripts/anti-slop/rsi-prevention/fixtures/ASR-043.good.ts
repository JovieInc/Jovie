/** Legitimate counterexample sample for ASR-043 (not a typechecked module). */
export const warmKey =
  'queryKeys.audience.members(profileId, filters)';

export function warmAudience() {
  // Matching infinite warm — scanned as source text.
  return 'prefetchInfiniteQuery';
}
