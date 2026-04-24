'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { AuthBrandPanel } from '@/features/auth/AuthBrandPanel';

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
      className='jovie-auth-modal fixed inset-0 m-auto h-auto max-h-[calc(100svh-40px)] w-[min(calc(100vw-24px),1040px)] overflow-auto rounded-[2.25rem] border border-white/[0.08] bg-[#08090a]/96 p-2.5 text-primary-token shadow-[0_40px_120px_rgba(0,0,0,0.52)] backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:w-[min(calc(100vw-32px),1040px)]'
    >
      <div
        data-auth-modal-body
        className='flex min-h-[min(720px,calc(100svh-56px))] flex-col gap-2 lg:flex-row lg:items-stretch'
      >
        <div className='flex min-h-0 flex-1 flex-col rounded-[1.9rem] bg-transparent px-4 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-7'>
          <div className='mb-5 flex items-start justify-between gap-4'>
            <button
              type='button'
              onClick={dismiss}
              aria-label='Back to chat'
              className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-secondary-token transition-colors hover:bg-white/[0.08] hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
            >
              <ArrowLeft
                className='h-4 w-4'
                strokeWidth={2}
                aria-hidden='true'
              />
            </button>
            {statusRow ?? null}
          </div>

          <div className='flex min-h-0 flex-1 flex-col justify-center'>
            {children}
          </div>
        </div>

        <div className='auth-desktop-only lg:flex lg:w-80 lg:shrink-0 lg:items-center'>
          <AuthBrandPanel variant='modal' className='w-full' />
        </div>
      </div>
    </dialog>
  );
}
