'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { useModalFocusBoundary } from '@/lib/a11y/modal-focus-boundary';
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
  const dialogRef = useRef<HTMLDialogElement>(null);
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
      router.push(resolvedBackDestination);
      return;
    }
    dismiss();
  }, [dismiss, resolvedBackDestination, router]);

  useModalFocusBoundary(dialogRef, true, {
    lockScroll: true,
    onDismiss: dismiss,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      dismiss();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [dismiss]);

  const onBackdropMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (event.target === dialogRef.current) dismiss();
    },
    [dismiss]
  );

  return (
    <dialog
      ref={dialogRef}
      aria-label={ariaLabel}
      aria-modal='true'
      data-auth-modal-shell
      data-auth-shell-kind={AUTH_SHELL_KIND.interceptedModal}
      onMouseDown={onBackdropMouseDown}
      className='jovie-auth-modal fixed inset-0 m-0 h-dvh max-h-dvh w-[100dvw] max-w-none overflow-y-auto overscroll-contain rounded-none border-0 bg-base p-0 text-primary-token shadow-none backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:m-auto sm:h-auto sm:max-h-[min(600px,calc(100svh-32px))] sm:w-[min(calc(100vw-32px),420px)] sm:rounded-[2rem] sm:border sm:border-white/[0.08] sm:bg-(--color-bg-base)/96 sm:p-4 sm:shadow-[0_36px_100px_rgba(0,0,0,0.5)]'
    >
      <div
        data-auth-modal-body
        className='flex min-h-dvh flex-col bg-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:min-h-0 sm:rounded-[1.6rem] sm:px-4 sm:py-4'
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
            <div className='min-w-0 text-xs leading-[1.45] tracking-[-0.01em] text-white/54'>
              {statusRow}
            </div>
          ) : null}
        </div>

        <div className='mx-auto flex w-full min-h-0 flex-1 flex-col'>
          {children}
        </div>
      </div>
    </dialog>
  );
}
