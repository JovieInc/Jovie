/** Legitimate counterexample sample for ASR-043 (not a typechecked module). */
// Stock/SSR-only wins ties: Audience and Identity have no nav hover warm.
export const audienceRoute = 'case \'audience\': break;';
export const presenceRoute = 'case \'presence\': break;';

export function noWarmPrefetch() {
  // SSR-first — scanned as source text by the contract runner.
  return 'SSR-only; no prefetchQuery / prefetchInfiniteQuery';
}
