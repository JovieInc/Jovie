/**
 * Merch generation recovery receipt (JOV-12581 / Sentry 7847611605).
 *
 * The queue-tick merch-generation reconciler
 * (apps/web/lib/merch/generation-recovery.ts) is the designed fail-safe
 * that fails merch generation work stranded by request cutoffs (function
 * budget, deploy, crash) — e.g. the 2026-11-13 DEPLOYMENT_PAUSED window.
 * A successful reconciliation is the fail-safe working, not an application
 * error, but `captureWarning` files a `captureException(new Error(...))`
 * whose Sentry/Linear title reads `Error: [merch-generation-recovery]
 * reconciled stale merch generation work`, so each pass pages and files a
 * prod-errors issue. The receipt stays observable through captureError's
 * console + analytics record; only the Sentry filing is dropped, in the
 * server and edge beforeSend hooks (plus `ignoreErrors`).
 *
 * This lives in its own module because non-actionable-issues.ts and the
 * other natural consumers are pinned at Company-guards size-500 ceilings
 * with zero line headroom.
 */

/** The exact receipt message captureWarning emits on a successful pass. */
export const MERCH_GENERATION_RECOVERY_RECEIPT_PATTERN =
  /\[merch-generation-recovery\] reconciled stale merch generation work/;

/** Drop the designed-path receipt in server/edge `ignoreErrors`. */
export const MERCH_GENERATION_RECOVERY_IGNORE_ERRORS: ReadonlyArray<RegExp> = [
  MERCH_GENERATION_RECOVERY_RECEIPT_PATTERN,
];

/**
 * True when a string is the successful-reconciliation receipt. Real
 * reconciler failures (a different message) never match.
 */
export function isMerchGenerationRecoveryReceiptText(
  value: string | null | undefined
): boolean {
  return MERCH_GENERATION_RECOVERY_RECEIPT_PATTERN.test(value ?? '');
}

interface MerchRecoverySentryEventLike {
  readonly title?: string | null;
  readonly message?: string | null;
  readonly logentry?: {
    readonly formatted?: string | null;
  } | null;
  readonly extra?: Record<string, unknown> | null;
  readonly exception?: {
    readonly values?: ReadonlyArray<{
      readonly type?: string | null;
      readonly value?: string | null;
    } | null> | null;
  } | null;
}

/**
 * True when a Sentry event is the successful merch generation recovery
 * receipt (title, exception value, extra.message, or logentry).
 */
export function isNonActionableMerchGenerationRecoveryEvent(
  event: MerchRecoverySentryEventLike
): boolean {
  const values: unknown[] = [
    event.title,
    event.message,
    event.logentry?.formatted,
    ...Object.values(event.extra ?? {}),
    ...(event.exception?.values ?? []).map(value => value?.value),
  ];
  return values.some(
    value =>
      typeof value === 'string' && isMerchGenerationRecoveryReceiptText(value)
  );
}
