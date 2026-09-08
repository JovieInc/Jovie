'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useModalFocusBoundary } from '@/lib/a11y/modal-focus-boundary';
import { AUTH_SHELL_KIND } from '@/lib/auth/auth-shell-layout-contract';

interface AuthModalShellProps {
  readonly children: React.ReactNode;
  readonly statusRow?: React.ReactNode;
  readonly ariaLabel?: string;
  /**
   * Visible label for the quiet unboxed back control. Defaults to
   * "Back to homepage" so the destination is explicit. Callers that know
   * their origin — e.g. chat intake — pass "Back to chat".
   */
  readonly backButtonLabel?: string;
}

export function AuthModalShell({
  children,
  statusRow,
  ariaLabel = 'Authentication',
  backButtonLabel = 'Back to homepage',
}: AuthModalShellProps) {
  // Guard against callers passing an empty or whitespace-only string — a
  // literal '' on an aria-label makes the button invisible to assistive tech
  // even though the default prop would otherwise have fallen through.
  const resolvedBackButtonLabel =
    backButtonLabel.trim().length > 0 ? backButtonLabel : 'Back to homepage';
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dismiss = useCallback(() => {
    router.back();
  }, [router]);

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
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: native <dialog> opened via showModal() is interactive; mouseDown is the documented way to detect ::backdrop clicks.
    <dialog
      ref={dialogRef}
      aria-label={ariaLabel}
      aria-modal='true'
      data-auth-modal-shell
      data-auth-shell-kind={AUTH_SHELL_KIND.interceptedModal}
      onMouseDown={onBackdropMouseDown}
      className='jovie-auth-modal fixed inset-0 m-0 h-dvh max-h-dvh w-[100dvw] max-w-none overflow-y-auto overscroll-contain rounded-none border-0 bg-background p-0 text-primary-token shadow-none backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:m-auto sm:h-auto sm:max-h-[min(600px,calc(100svh-32px))] sm:w-[min(calc(100vw-32px),420px)] sm:rounded-[2rem] sm:border sm:border-white/[0.08] sm:bg-background/96 sm:p-4 sm:shadow-[0_36px_100px_rgba(0,0,0,0.5)]'
    >
      <div
        data-auth-modal-body
        className='flex min-h-dvh flex-col bg-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:min-h-0 sm:rounded-[1.6rem] sm:px-4 sm:py-4'
      >
        <div className='mb-5 flex min-w-0 flex-col items-start gap-3 sm:mb-6'>
          <button
            type='button'
            onClick={dismiss}
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
