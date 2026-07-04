'use client';

import { type ExternalToast, toast as sonnerToast } from 'sonner';

/**
 * Canonical toast API for Jovie.
 *
 * This module is the single entry point for ephemeral action feedback
 * (confirmations and errors). It wraps Sonner — we adopt the battle-tested
 * renderer rather than rebuilding it — but no app code should import
 * `sonner` directly. Import from `@/components/feedback` instead so the
 * whole app shares one renderer, one set of duration presets, and one
 * set of tokens and motion timing.
 *
 * Rendering behavior (bottom-right position, 4s default auto-dismiss,
 * max 3 stacked, manual close button, safe-area inset) is owned by
 * `FeedbackProvider`. Visual styling is driven by design-system tokens
 * via the `[data-sonner-toast]` overrides in `globals.css` (success
 * green, error red, info blue accents).
 *
 * Methods are arity-preserving passthroughs: calls forward to the
 * renderer exactly as written, and per-call options always win over the
 * provider defaults.
 *
 * @example
 * ```tsx
 * import { toast } from '@/components/feedback';
 *
 * toast.success('Changes saved');
 * toast.error('Failed to save. Please try again.');
 * toast.info('New update available');
 * toast.success('Copied', { duration: TOAST_DURATIONS.SHORT });
 * ```
 */

/**
 * Duration presets (ms). The provider default is `DEFAULT` (4s, within
 * the canonical 3–5s auto-dismiss window); use these to opt into
 * shorter/longer reads per call.
 */
export const TOAST_DURATIONS = {
  /** Quick confirmation (2s) - for instant actions like copy */
  SHORT: 2000,
  /** Standard duration (4s) - the provider default for all variants */
  DEFAULT: 4000,
  /** Medium duration (5s) - for warnings */
  MEDIUM: 5000,
  /** Longer duration (6s) - for errors that need reading */
  LONG: 6000,
  /** Extended duration (8s) - for action toasts (undo, retry) */
  ACTION: 8000,
  /** Persistent until dismissed - for loading states */
  PERSISTENT: Number.POSITIVE_INFINITY,
} as const;

/** Options accepted by every toast method. */
export type ToastOptions = ExternalToast;

/** Identifier returned by toast methods; pass to `toast.dismiss`. */
export type ToastId = string | number;

type ToastMessage = Parameters<typeof sonnerToast>[0];
type ToastRest = [options?: ToastOptions];

function baseToast(message: ToastMessage, ...rest: ToastRest): ToastId {
  return sonnerToast(message, ...rest);
}

/**
 * Canonical toast object.
 *
 * Variants: `success` (green accent), `error` (red accent), `info` (blue
 * accent) — all auto-dismiss (provider default 4s) with a manual close
 * button. `warning`, `loading`, `message`, `promise`, `custom`, and
 * `dismiss` cover the full range of existing call sites.
 */
export const toast = Object.assign(baseToast, {
  success: (message: ToastMessage, ...rest: ToastRest): ToastId =>
    sonnerToast.success(message, ...rest),
  error: (message: ToastMessage, ...rest: ToastRest): ToastId =>
    sonnerToast.error(message, ...rest),
  info: (message: ToastMessage, ...rest: ToastRest): ToastId =>
    sonnerToast.info(message, ...rest),
  warning: (message: ToastMessage, ...rest: ToastRest): ToastId =>
    sonnerToast.warning(message, ...rest),
  message: (message: ToastMessage, ...rest: ToastRest): ToastId =>
    sonnerToast.message(message, ...rest),
  loading: (message: ToastMessage, ...rest: ToastRest): ToastId =>
    sonnerToast.loading(message, ...rest),
  /** Promise toast: loading → success/error. Passthrough to the renderer. */
  promise: sonnerToast.promise,
  /** Custom render passthrough for advanced cases. */
  custom: sonnerToast.custom,
  /** Dismiss one toast by id, or all when called with no argument. */
  dismiss: (id?: ToastId): ToastId | undefined => sonnerToast.dismiss(id),
});

const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Extract a human-readable message from an unknown error for toast
 * display. Technical/verbose messages fall back to a generic string so we
 * never surface stack traces or internals to users.
 */
export function getFeedbackErrorMessage(
  error: unknown,
  fallback: string = GENERIC_ERROR_MESSAGE
): string {
  if (typeof error === 'string' && error.length > 0 && error.length <= 140) {
    return error;
  }
  if (
    error instanceof Error &&
    error.message &&
    error.message.length <= 140 &&
    !error.message.includes(' at ') &&
    !['TypeError', 'ReferenceError', 'SyntaxError'].includes(error.name)
  ) {
    return error.message;
  }
  return fallback;
}
