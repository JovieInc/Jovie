import 'server-only';

/**
 * Sanitized merch generation failure telemetry (dispatch PR-1).
 *
 * Per-design generation failures inside `generateMerchDesigns` were previously
 * swallowed: an all-fail batch returned `success: true, designs: []` with no
 * reason, and every merch log line is a dev/preview-only `logger` no-op in
 * production. This module gives the batch a sanitized outcome contract:
 *
 * - `classifyMerchGenerationFailure` maps a per-design failure to a coarse
 *   stage/class (`image_timeout` / `image_provider` / `artwork_upload` /
 *   `persist` / `content_reject` / `unknown`) — never a raw provider message
 *   or PII, so it is safe on user-facing result payloads.
 * - `buildMerchGenerationFailureSummary` folds the per-attempt classes into
 *   the `{ requested, ready, byClass }` summary stamped on the carousel
 *   result, the generation receipt, and every capture.
 * - `captureMerchGenerationFailureOutcome` makes the outcome
 *   production-visible through the canonical `@/lib/error-tracking` wrapper
 *   (console + Sentry + analytics): one error-level incident per batch when
 *   no design rendered for a non-content reason, one warning-level event for
 *   a partial batch. A purely content-rejected batch is an expected product
 *   gate, never a provider incident.
 * - `captureMerchCatalogFallback` records the default-pricing fallback at
 *   warning level with a sanitized reason class.
 */

import { captureError, captureWarning } from '@/lib/error-tracking';
import { MerchPersonContentRejectedError } from './content-contract';

/** Coarse, sanitized per-design failure classes. */
export type MerchGenerationFailureClass =
  | 'image_timeout'
  | 'image_provider'
  | 'artwork_upload'
  | 'persist'
  | 'content_reject'
  | 'unknown';

/** Pipeline stage a per-design failure happened in. */
export type MerchGenerationStage = 'graphic' | 'artwork' | 'persist';

export interface MerchGenerationFailureSummary {
  readonly requested: number;
  readonly ready: number;
  readonly byClass: Partial<Record<MerchGenerationFailureClass, number>>;
}

/** Sanitized reason classes for the catalog/pricing fallback path. */
export type MerchCatalogFallbackReason =
  | 'catalog_timeout'
  | 'catalog_unavailable'
  | 'catalog_unknown';

const MERCH_NO_USABLE_DESIGNS_ERROR_CLASS =
  'merch_generation_no_usable_designs';
const MERCH_PARTIAL_BATCH_ERROR_CLASS = 'merch_generation_partial';
const MERCH_CATALOG_FALLBACK_ERROR_CLASS = 'merch_catalog_fallback';

function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return true;
    }
    return /timeout|timed out|deadline exceeded/i.test(error.message);
  }
  return false;
}

/**
 * Classify one per-design failure. Class names are sanitized on purpose —
 * they appear on user-facing result payloads, so raw provider messages and
 * prompt content never flow through here.
 */
export function classifyMerchGenerationFailure(input: {
  readonly stage: MerchGenerationStage;
  readonly error: unknown;
}): MerchGenerationFailureClass {
  if (input.error instanceof MerchPersonContentRejectedError) {
    return 'content_reject';
  }
  switch (input.stage) {
    case 'graphic':
      return isTimeoutError(input.error) ? 'image_timeout' : 'image_provider';
    case 'artwork':
      return 'artwork_upload';
    case 'persist':
      return 'persist';
    default:
      return 'unknown';
  }
}

/** Fold per-attempt failure classes into the batch summary. */
export function buildMerchGenerationFailureSummary(input: {
  readonly requested: number;
  readonly ready: number;
  readonly failureClasses: readonly MerchGenerationFailureClass[];
}): MerchGenerationFailureSummary {
  const byClass: Partial<Record<MerchGenerationFailureClass, number>> = {};
  for (const failureClass of input.failureClasses) {
    byClass[failureClass] = (byClass[failureClass] ?? 0) + 1;
  }
  return {
    requested: input.requested,
    ready: input.ready,
    byClass,
  };
}

/** Sanitized one-line description (counts and classes only, no raw text). */
function describeFailureSummary(summary: MerchGenerationFailureSummary) {
  const classes = Object.entries(summary.byClass)
    .map(([name, count]) => `${name}=${count}`)
    .join(' ');
  return `${summary.ready} of ${summary.requested} designs ready${
    classes ? ` (${classes})` : ''
  }`;
}

/**
 * Make the batch outcome production-visible. Called exactly once per batch:
 * - 0 ready with at least one non-content failure → one error-level incident.
 * - partial batch (0 < ready < requested) → one warning-level event.
 * - 0 ready purely from content rejection → no capture (expected gate).
 */
export async function captureMerchGenerationFailureOutcome(input: {
  readonly generationId: string;
  readonly failureSummary: MerchGenerationFailureSummary;
}): Promise<void> {
  const { ready, requested } = input.failureSummary;
  const nonContentFailures = Object.entries(
    input.failureSummary.byClass
  ).filter(([failureClass]) => failureClass !== 'content_reject');

  if (ready === 0) {
    if (nonContentFailures.length === 0) return;
    await captureError(
      'Merch design generation produced no usable designs',
      new Error(
        `merch generation batch ${input.generationId}: ${describeFailureSummary(
          input.failureSummary
        )}`
      ),
      {
        feature: 'merch',
        stage: 'generation',
        generationId: input.generationId,
        failureSummary: input.failureSummary,
        error_class: MERCH_NO_USABLE_DESIGNS_ERROR_CLASS,
      }
    );
    return;
  }

  if (ready < requested) {
    await captureWarning(
      'Merch design generation produced a partial batch',
      new Error(
        `merch generation batch ${input.generationId}: ${describeFailureSummary(
          input.failureSummary
        )}`
      ),
      {
        feature: 'merch',
        stage: 'generation',
        generationId: input.generationId,
        failureSummary: input.failureSummary,
        error_class: MERCH_PARTIAL_BATCH_ERROR_CLASS,
      }
    );
  }
}

/** Sanitized reason class for the catalog/pricing fallback. */
export function classifyMerchCatalogFallbackReason(
  error: unknown
): MerchCatalogFallbackReason {
  if (isTimeoutError(error)) return 'catalog_timeout';
  if (error instanceof Error || typeof error === 'string') {
    return 'catalog_unavailable';
  }
  return 'catalog_unknown';
}

/**
 * Record that a generation batch fell back to default (draft-only) catalog
 * pricing. Warning level: generation still completes, but the options cannot
 * publish until the live catalog responds again.
 */
export async function captureMerchCatalogFallback(input: {
  readonly error: unknown;
}): Promise<void> {
  const reason = classifyMerchCatalogFallbackReason(input.error);
  await captureWarning(
    'Merch generation fell back to default catalog pricing',
    input.error,
    {
      feature: 'merch',
      stage: 'catalog',
      reason,
      error_class: MERCH_CATALOG_FALLBACK_ERROR_CLASS,
    }
  );
}
