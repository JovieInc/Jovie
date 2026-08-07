import 'server-only';

/**
 * Canonical merch generation contract (JOV-4743).
 *
 * There is exactly one canonical generation pipeline for chat-driven merch:
 * `generateMerchDesigns` in `@/lib/merch/design-generation`. Every chat tool
 * (`createMerch`, `previewMerchOptions`) must enter through it so the
 * versioned prompt/content contract (verified source + no-person rules), the
 * reviewer/evidence payload (`qualityReview`), and the publish blockers apply
 * identically at every entry point.
 *
 * This module is the single source of truth for:
 * - the contract version stamped on every generated option,
 * - the truthful-mockup lifecycle states (`pending_mockup` until the real
 *   Printful mockup exists, then a terminal `mockup_ready`/`mockup_failed`),
 * - the production receipt shape logged for every generation batch.
 */

export const MERCH_GENERATION_CONTRACT_VERSION = 'merch-generation/v1';

export const MERCH_CANONICAL_PIPELINE_ID =
  'lib/merch/design-generation.generateMerchDesigns';

/**
 * Truthful-mockup lifecycle for a generated design option. Options start as
 * `pending_mockup` (only the alpha print art exists) and must reach a terminal
 * state: `mockup_ready` (real Printful product mockup attached) or
 * `mockup_failed` (timeout/retry budget exhausted — blocks publish).
 */
export type MerchMockupStatus =
  | 'pending_mockup'
  | 'mockup_ready'
  | 'mockup_failed';

export const MERCH_MOCKUP_TERMINAL_STATUSES: readonly MerchMockupStatus[] = [
  'mockup_ready',
  'mockup_failed',
];

/**
 * User-visible publish blocker for an option whose truthful mockup reached a
 * terminal failure. Surfaced in sellability reasons and selection results.
 */
export const MERCH_MOCKUP_FAILURE_PUBLISH_BLOCKER =
  'Product mockup failed to render on the real garment; regenerate the design before publishing.';

/**
 * Reads the persisted mockup lifecycle state from an option's qualityReview
 * evidence payload. Options generated before this contract (or through the
 * legacy deterministic path) have no stamp and return null — they keep their
 * historical behavior (backward compatible).
 */
export function readOptionMockupStatus(
  qualityReview: Record<string, unknown> | null | undefined
): MerchMockupStatus | null {
  const value = qualityReview?.mockupStatus;
  return value === 'pending_mockup' ||
    value === 'mockup_ready' ||
    value === 'mockup_failed'
    ? value
    : null;
}

export interface MerchGenerationReceipt {
  readonly pipeline: typeof MERCH_CANONICAL_PIPELINE_ID;
  readonly contractVersion: typeof MERCH_GENERATION_CONTRACT_VERSION;
  readonly generationId: string;
  readonly profileId: string;
  readonly requestedDesignCount: number;
  readonly readyDesignCount: number;
  /** Per-option terminal mockup disposition (empty when none scheduled). */
  readonly mockups: readonly {
    readonly optionId: string;
    readonly status: MerchMockupStatus;
    readonly attempts: number;
    readonly error?: string;
  }[];
  /** Final disposition of the batch: ready (options returned) or failed. */
  readonly disposition: 'ready' | 'failed';
  readonly durationMs: number;
}
