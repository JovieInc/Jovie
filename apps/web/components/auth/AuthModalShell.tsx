'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

interface AuthModalShellProps {
  readonly children: React.ReactNode;
  readonly statusRow?: React.ReactNode;
  readonly ariaLabel?: string;
}

export function AuthModalShell({
  children,
  statusRow,
  ariaLabel = 'Authentication',
}: AuthModalShellProps) {
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
      className='jovie-auth-modal fixed inset-0 m-auto h-auto max-h-[calc(100svh-40px)] w-[min(calc(100vw-24px),600px)] overflow-auto rounded-[2rem] border border-white/[0.08] bg-[#08090a]/96 p-3 text-primary-token shadow-[0_36px_100px_rgba(0,0,0,0.5)] backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:w-[min(calc(100vw-32px),600px)] sm:p-4'
    >
      <div
        data-auth-modal-body
        className='flex min-h-0 flex-col rounded-[1.6rem] bg-transparent px-3 py-3 sm:px-4 sm:py-4'
      >
        <div className='mb-5 flex min-w-0 items-center gap-3 sm:mb-6'>
          <button
            type='button'
            onClick={dismiss}
            aria-label='Back to chat'
            className='inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-secondary-token transition-colors hover:bg-white/[0.08] hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
          >
            <ArrowLeft className='h-4 w-4' strokeWidth={2} aria-hidden='true' />
          </button>
          {statusRow ? (
            <div className='min-w-0 flex-1 text-[12px] leading-[1.45] tracking-[-0.01em] text-white/54'>
              {statusRow}
            </div>
          ) : null}
        </div>

        <div className='mx-auto flex w-full max-w-[520px] min-h-0 flex-1 flex-col'>
          {children}
        </div>
      </div>
    </dialog>
  );
}
