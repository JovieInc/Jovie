'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

interface AuthModalShellProps {
  readonly children: React.ReactNode;
  readonly statusRow?: React.ReactNode;
  readonly ariaLabel?: string;
  /**
   * aria-label for the back/dismiss button. Defaults to "Go back" so the
   * shell is accurate no matter which entry point opened it (chat intake,
   * profile claim, direct /signup, dev unavailable card, etc.). Callers
   * that know their origin — e.g. chat intake — can pass a more specific
   * label like "Back to chat".
   */
  readonly backButtonLabel?: string;
}

export function AuthModalShell({
  children,
  statusRow,
  ariaLabel = 'Authentication',
  backButtonLabel = 'Go back',
}: AuthModalShellProps) {
  // Guard against callers passing an empty or whitespace-only string — a
  // literal '' on an aria-label makes the button invisible to assistive tech
  // even though the default prop would otherwise have fallen through.
  const resolvedBackButtonLabel =
    backButtonLabel.trim().length > 0 ? backButtonLabel : 'Go back';
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const body = globalThis.document?.body;
    const root = globalThis.document?.documentElement;
    if (!body || !root) return;

    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;

    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'contain';
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'contain';

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
    };
  }, []);

  const dismiss = useCallback(() => {
    router.back();
  }, [router]);

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
      data-auth-modal-shell
      onMouseDown={onBackdropMouseDown}
      className='jovie-auth-modal fixed inset-0 m-0 h-dvh max-h-dvh w-[100dvw] max-w-none overflow-y-auto overscroll-contain rounded-none border-0 bg-background p-0 text-primary-token shadow-none backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:m-auto sm:h-auto sm:max-h-[min(600px,calc(100svh-32px))] sm:w-[min(calc(100vw-32px),420px)] sm:rounded-[2rem] sm:border sm:border-white/[0.08] sm:bg-background/96 sm:p-4 sm:shadow-[0_36px_100px_rgba(0,0,0,0.5)]'
    >
      <div
        data-auth-modal-body
        className='flex min-h-dvh flex-col bg-transparent pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] sm:min-h-0 sm:rounded-[1.6rem] sm:px-4 sm:py-4'
      >
        <div className='mb-5 flex min-w-0 items-center gap-3 sm:mb-6'>
          <button
            type='button'
            onClick={dismiss}
            aria-label={resolvedBackButtonLabel}
            className='inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-secondary-token transition-colors hover:bg-white/[0.08] hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
          >
            <ArrowLeft className='h-4 w-4' strokeWidth={2} aria-hidden='true' />
          </button>
          {statusRow ? (
            <div className='min-w-0 flex-1 text-xs leading-[1.45] tracking-[-0.01em] text-white/54'>
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
