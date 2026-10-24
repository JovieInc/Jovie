'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { Modal } from '@/components/molecules/Modal';
import { APP_ROUTES } from '@/constants/routes';
import { AUTH_SHELL_KIND } from '@/lib/auth/auth-shell-layout-contract';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';

/**
 * Labels whose destination is fixed and validated. The visible back promise
 * and the actual navigation target must never diverge based on browser
 * history (JOV-6225) — a known label resolves to a known destination.
 */
const KNOWN_BACK_DESTINATIONS = {
  'Back to homepage': APP_ROUTES.HOME,
} as const;

interface AuthModalShellProps {
  readonly children: React.ReactNode;
  readonly statusRow?: React.ReactNode;
  readonly ariaLabel?: string;
  /**
   * Visible label for the quiet unboxed back control. Defaults to
   * "Back to homepage" so the destination is explicit. Callers that know
   * their origin — e.g. chat intake — pass "Back to chat" together with a
   * matching backDestination.
   */
  readonly backButtonLabel?: string;
  /**
   * Explicit validated destination the visible back control navigates to.
   * When omitted, it is derived from the known back labels. A label without
   * a known or valid destination falls back to safe modal dismissal instead
   * of guessing a route — the control never navigates somewhere its label
   * did not promise.
   */
  readonly backDestination?: string;
}

/**
 * Same-app relative paths only. Matches sanitizeRedirectUrl's threat model:
 * rejects protocol-relative URLs and backslash-normalization bypasses.
 * Unlike sanitizeRedirectUrl this accepts the bare root path "/", which is
 * the "Back to homepage" destination.
 */
function resolveBackDestination(
  label: string,
  destination: string | undefined
): string | null {
  const knownDestination = Object.hasOwn(KNOWN_BACK_DESTINATIONS, label)
    ? KNOWN_BACK_DESTINATIONS[label as keyof typeof KNOWN_BACK_DESTINATIONS]
    : null;
  const candidate = destination ?? knownDestination;
  if (!candidate) return null;
  const trimmed = candidate.trim();
  return trimmed === APP_ROUTES.HOME
    ? APP_ROUTES.HOME
    : sanitizeRedirectUrl(trimmed);
}

export function AuthModalShell({
  children,
  statusRow,
  ariaLabel = 'Authentication',
  backButtonLabel = 'Back to homepage',
  backDestination,
}: AuthModalShellProps) {
  // Guard against callers passing an empty or whitespace-only string — a
  // literal '' on an aria-label makes the button invisible to assistive tech
  // even though the default prop would otherwise have fallen through.
  const resolvedBackButtonLabel =
    backButtonLabel.trim().length > 0 ? backButtonLabel : 'Back to homepage';
  const resolvedBackDestination = resolveBackDestination(
    resolvedBackButtonLabel,
    backDestination
  );
  const router = useRouter();
  // Escape and backdrop are modal-DISMISSAL: pop the intercepted route via
  // history. They must never navigate somewhere unrelated, so they do not
  // use the destination path.
  const dismiss = useCallback(() => {
    router.back();
  }, [router]);
  // The visible back control is destination navigation: it goes exactly
  // where its label promises, independent of the history stack. Without a
  // validated destination it degrades to dismissal instead of guessing.
  const handleBackControl = useCallback(() => {
    if (resolvedBackDestination) {
      // Soft push leaves the intercepted @auth dialog mounted when the
      // destination is already the page underneath the modal. A full
      // navigation drops that slot and still lands on the labeled
      // destination, independent of history (JOV-6225).
      window.location.assign(resolvedBackDestination);
      return;
    }
    dismiss();
  }, [dismiss, resolvedBackDestination]);

  return (
    <Modal
      onDismiss={dismiss}
      aria-label={ariaLabel}
      aria-modal='true'
      data-auth-modal-shell
      data-auth-shell-kind={AUTH_SHELL_KIND.interceptedModal}
      className='jovie-auth-modal'
    >
      <div
        data-auth-modal-body
        className='flex min-h-dvh flex-col bg-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:min-h-0 sm:px-4 sm:py-4'
      >
        <div className='mb-5 flex min-w-0 flex-col items-start gap-3 sm:mb-6'>
          <button
            type='button'
            onClick={handleBackControl}
            aria-label={resolvedBackButtonLabel}
            className='rounded-sm text-sm text-secondary-token underline-offset-2 transition-colors hover:text-primary-token hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
          >
            {resolvedBackButtonLabel}
          </button>
          {statusRow ? (
            <div className='min-w-0 text-xs leading-[1.45] tracking-[-0.01em] text-secondary-token'>
              {statusRow}
            </div>
          ) : null}
        </div>

        <div className='mx-auto flex w-full min-h-0 flex-1 flex-col'>
          {children}
        </div>
      </div>
    </Modal>
  );
}
