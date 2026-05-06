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
      className='jovie-auth-modal fixed inset-0 m-auto h-auto min-h-[min(560px,calc(100svh-40px))] max-h-[calc(100svh-40px)] w-[min(calc(100vw-24px),600px)] overflow-hidden rounded-[1.75rem] border border-white/[0.1] bg-[#07080a]/[0.94] p-2 text-primary-token shadow-[0_40px_120px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop:bg-black/72 backdrop:backdrop-blur-md sm:w-[min(calc(100vw-32px),600px)] sm:p-3'
    >
      <div aria-hidden='true' className='pointer-events-none absolute inset-0'>
        <div className='absolute -left-28 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(82,142,232,0.32),transparent_68%)] blur-3xl' />
        <div className='absolute -bottom-28 -right-28 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(92,185,206,0.2),transparent_70%)] blur-3xl' />
        <div className='absolute inset-x-10 top-28 h-32 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(207,125,83,0.11),transparent_70%)] blur-2xl' />
        <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent_30%,rgba(0,0,0,0.28))]' />
      </div>
      <div
        data-auth-modal-body
        className='relative z-10 flex max-h-[calc(100svh-64px)] min-h-[min(544px,calc(100svh-56px))] flex-col overflow-y-auto rounded-[1.45rem] bg-black/[0.18] px-3 py-3 backdrop-blur-[2px] sm:px-4 sm:py-4'
      >
        <div className='mb-5 flex min-w-0 items-center gap-3 sm:mb-6'>
          <button
            type='button'
            onClick={dismiss}
            aria-label={resolvedBackButtonLabel}
            className='inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-secondary-token shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors hover:bg-white/[0.08] hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
          >
            <ArrowLeft className='h-4 w-4' strokeWidth={2} aria-hidden='true' />
          </button>
          <div
            className='min-h-[1.1rem] min-w-0 flex-1 text-[12px] leading-[1.45] tracking-[-0.01em] text-white/54'
            aria-hidden={statusRow ? undefined : true}
          >
            {statusRow}
          </div>
        </div>

        <div className='mx-auto flex min-h-[440px] w-full max-w-[520px] flex-1 flex-col'>
          {children}
        </div>
      </div>
    </dialog>
  );
}
