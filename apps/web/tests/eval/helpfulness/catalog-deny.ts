/**
 * Hermetic detector for ASS-16 δ3 / ASS-36 deferred catalog-deny.
 *
 * Calibration `best-release` says "I don't have per-release streaming data"
 * while Discography lists releases (and even names Tidal Drift), so
 * mustMentionAny grounding alone does not fail closed. #26390 shipped only
 * empty-profile needles; #26382 / #26395 skip this theme.
 *
 * Offline only: no model, Gateway, or network.
 */

/** Phrases that deny visible Discography Context despite listed releases. */
export const DENIES_VISIBLE_CATALOG_PATTERNS: readonly RegExp[] = [
  /\bi don(?:'|’)t have per-release\b/i,
  /\bno per-release (?:streaming )?data\b/i,
  /\black per-release\b/i,
  /\bcan(?:'|’)t (?:pull|see|access|get) (?:per-release|track-by-track)\b/i,
  /\bdon(?:'|’)t have (?:track-by-track|per-release) (?:streaming )?(?:data|performance|numbers)\b/i,
];

export function deniesVisibleCatalog(text: string): boolean {
  return DENIES_VISIBLE_CATALOG_PATTERNS.some(pattern => pattern.test(text));
}

/** Established / lapsed fixtures always have Discography rows in the bank. */
export function fixtureHasCatalog(
  fixture: 'established' | 'new' | 'lapsed'
): boolean {
  return fixture === 'established' || fixture === 'lapsed';
}
