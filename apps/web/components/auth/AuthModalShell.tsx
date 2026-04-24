'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { AuthBrandPanel } from '@/features/auth/AuthBrandPanel';

interface AuthModalShellProps {
  readonly children: React.ReactNode;
  /**
   * Optional status row rendered to the right of the back button.
   * Used for the "Continuing with '{prompt}'" intent hint.
   */
  readonly statusRow?: React.ReactNode;
  /** aria-label for the dialog element. Defaults to "Authentication". */
  readonly ariaLabel?: string;
}

/**
 * Shared shell for intercepted auth modals (desktop signup/signin).
 *
 * Wraps children in a native `<dialog>` opened via `showModal()` for free
 * focus trap + Escape handling. Dismissal via Escape, backdrop click, or
 * the back affordance — all route through `router.back()` so the URL stays
 * in sync with modal state (refresh on /signup shows the full-page, which
 * is the documented intercepting-route behavior).
 *
 * Used by:
 *   - `@auth/(.)signup/page.tsx`      — around Clerk's <SignUp />
 *   - `@auth/layout.tsx` (unavailable) — around <AuthUnavailableCard /> in dev
 *
 * Having both paths use the same shell means dev:local:browse shows the
 * same modal chrome as production; the content inside differs (unavailable
 * card vs real Clerk form) but the dialog a11y and dismissal behavior stay
 * identical. This catches modal-layering bugs in dev without needing real
 * Clerk keys on every developer's machine.
 */
export function AuthModalShell({
  children,
  statusRow,
  ariaLabel = 'Authentication',
}: AuthModalShellProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Open as native modal for focus-trap behavior at no React cost.
  //
  // The cleanup does NOT call dialog.close(). In StrictMode dev, React runs
  // effect cleanup between double-mount cycles, which would fire a `close`
  // event on the dialog — and any handler listening for that event would
  // trigger before the second mount, causing surprise navigation. Relying
  // on DOM removal on unmount is enough; native dialogs handle it cleanly.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
  }, []);

  const dismiss = useCallback(() => {
    router.back();
  }, [router]);

  // Listen for `cancel` (Escape-only, user intent), NOT `close` (also fires
  // on programmatic close from unmount/StrictMode cleanup). Keeps URL in
  // sync when the user presses Escape to dismiss the modal.
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
      // Native dialog backdrop click targets the dialog element itself. Only
      // dismiss if the click originated on the backdrop, not on card content.
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
          <AuthBrandPanel compact className='w-full' />
        </div>
      </div>
    </dialog>
  );
}
