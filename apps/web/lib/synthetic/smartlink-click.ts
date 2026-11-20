import type { BotDetectionResult } from '@/lib/utils/bot-detection';

/**
 * Synthetic-tagged smartlink click classification (JOV-9625).
 *
 * The production golden-path certification needs to click a real smartlink
 * through the normal `/api/track` capture path while staying excluded from
 * every customer metric. A request that carries a valid canary passage token
 * (scope `smartlink_click`, see `passage-token.ts`) is therefore classified
 * as a bot click — the predicate every user-facing analytics aggregate
 * already filters on (`is_bot = false`) — and additionally tagged
 * `synthetic: 'prodcert'` in the click row metadata so certification clicks
 * stay distinguishable from real bot traffic.
 *
 * A missing or invalid token changes nothing: the classification is exactly
 * what bot detection alone would have produced.
 */

/** Metadata marker written on click rows captured via a passage token. */
export const SYNTHETIC_CLICK_TAG = 'prodcert';

export interface SyntheticClickClassification {
  /** Bot predicate used by every user-facing analytics filter. */
  readonly isBot: boolean;
  /** Human-readable reason for the classification. */
  readonly reason: string;
  /** Synthetic marker for the click row metadata, null for normal traffic. */
  readonly synthetic: typeof SYNTHETIC_CLICK_TAG | null;
}

export function classifySyntheticClick(
  botDetection: Pick<BotDetectionResult, 'isBot' | 'reason'>,
  passage: { readonly actorId: string } | null
): SyntheticClickClassification {
  if (passage) {
    return {
      isBot: true,
      reason: 'synthetic_passage_token',
      synthetic: SYNTHETIC_CLICK_TAG,
    };
  }
  return {
    isBot: botDetection.isBot,
    reason: botDetection.reason,
    synthetic: null,
  };
}
