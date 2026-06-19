/**
 * Album-art A/B test core — deterministic variant selection + winner computation.
 *
 * ponytail: pure math only; serving layer + DB analytics land when #11085 merges.
 *   Upgrade path: wire selectAlbumArtVariant into the profile-card RSC, emit
 *   impression/click events to audienceActions (objectType='album_art_variant'),
 *   then call computeAlbumArtWinner from a daily rollup to drive
 *   the artist recommendation surface.
 */

// --- Types ---

export interface AlbumArtVariantStats {
  readonly variantId: string;
  readonly impressions: number;
  readonly clicks: number;
}

export interface AlbumArtWinnerResult {
  readonly winnerId: string;
  readonly controlId: string;
  readonly winnerCtr: number;
  readonly controlCtr: number;
  /** Relative lift: (winner - control) / control. Can be Infinity when control CTR is 0. */
  readonly liftPercent: number;
  /** True when sample is sufficient and lift meets the significance threshold. */
  readonly isStatisticallySignificant: boolean;
}

// --- Constants ---

/** Minimum impressions per variant before declaring a winner. */
export const ALBUM_ART_AB_MIN_IMPRESSIONS = 100;

/**
 * Minimum *relative* lift required over control to be considered significant.
 * 0.1 = 10 % lift. The issue target is "10x better" as an extreme example;
 * significance here is a conservative guardrail against noise.
 */
export const ALBUM_ART_AB_MIN_LIFT = 0.1;

// --- Variant selection ---

/**
 * djb2 hash — fast, well-distributed, collision-resistant for short strings.
 */
function hashSeed(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Deterministically select one variant for a given visitor.
 *
 * @param variantIds  Ordered list of variant IDs. Index 0 is treated as control
 *                    (the canonical DSP cover). Caller populates from
 *                    AlbumArtManifest.candidates[].id.
 * @param visitorSeed Stable per-visitor string (fingerprint, session token, or
 *                    audience_members.fingerprint). Same seed → same variant.
 */
export function selectAlbumArtVariant(
  variantIds: readonly string[],
  visitorSeed: string
): string {
  if (variantIds.length === 0) {
    throw new RangeError('selectAlbumArtVariant: variantIds must be non-empty');
  }
  if (variantIds.length === 1) return variantIds[0]!;
  return variantIds[hashSeed(visitorSeed) % variantIds.length]!;
}

// --- Winner computation ---

/**
 * Compute the winning album-art variant from accumulated impression/click data.
 *
 * Returns `null` when:
 *  - Fewer than two variants have reached `minImpressions` (no valid comparison).
 *  - No challenger beats the control CTR (control is already optimal).
 *
 * The first entry in `variants` is treated as control (the canonical cover art).
 *
 * ponytail: significance = min-impressions + min-lift threshold only.
 *   Upgrade to a z-test for proportions when sample sizes grow large enough
 *   to warrant it (target: p < 0.05, ~1k+ impressions per variant).
 */
export function computeAlbumArtWinner(
  variants: readonly AlbumArtVariantStats[],
  options: { readonly minImpressions?: number } = {}
): AlbumArtWinnerResult | null {
  const minImpressions = options.minImpressions ?? ALBUM_ART_AB_MIN_IMPRESSIONS;

  if (variants.length < 2) return null;

  // variants[0] is the control (canonical cover art) per the JSDoc contract.
  // If control hasn't reached the impression threshold we can't make a valid
  // comparison — return null rather than misidentifying a challenger as control.
  const control = variants[0]!;
  if (control.impressions < minImpressions) return null;

  // Only challengers with sufficient impressions are eligible.
  const challengers = variants
    .slice(1)
    .filter(v => v.impressions >= minImpressions);
  if (challengers.length === 0) return null;

  const controlCtr =
    control.impressions > 0 ? control.clicks / control.impressions : 0;

  // Pick the best-performing challenger.
  const best = challengers.reduce<AlbumArtVariantStats>((prev, curr) => {
    const prevCtr = prev.clicks / prev.impressions;
    const currCtr = curr.clicks / curr.impressions;
    return currCtr > prevCtr ? curr : prev;
  }, challengers[0]!);

  const winnerCtr = best.clicks / best.impressions;

  // No challenger beats control.
  if (winnerCtr <= controlCtr) return null;

  const liftPercent =
    controlCtr > 0 ? (winnerCtr - controlCtr) / controlCtr : Infinity;

  return {
    winnerId: best.variantId,
    controlId: control.variantId,
    winnerCtr,
    controlCtr,
    liftPercent,
    isStatisticallySignificant: liftPercent >= ALBUM_ART_AB_MIN_LIFT,
  };
}
