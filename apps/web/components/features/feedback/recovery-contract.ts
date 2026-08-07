/**
 * RecoveryState contract — the single source of truth for error/recovery UI.
 *
 * Every error presenter (SystemBErrorFallback, PublicPageErrorFallback,
 * PageErrorState, ErrorBanner, and the chat inline error card) must take its
 * user-facing recovery copy from this module so the surfaces cannot drift
 * apart again ('Refresh' vs 'Try Again' vs 'Retry').
 *
 * Diagnostic identifiers (Next.js error digest / Error ID) are support-path
 * data: presenters may only render them behind an opt-in disclosure
 * (e.g. a <details> toggle), never in the default tree.
 */
export const RECOVERY_COPY = {
  /** Default headline for an unexpected error. */
  title: 'Something went wrong',
  /** The one recovery action label. There is a single recovery path. */
  retryLabel: 'Try again',
  /** Label for the opt-in support/diagnostics disclosure. */
  detailsLabel: 'Error details',
} as const;

export type RecoveryCopy = typeof RECOVERY_COPY;
