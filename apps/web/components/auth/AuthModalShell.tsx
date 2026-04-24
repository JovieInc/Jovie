'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

interface AuthModalShellProps {
  readonly children: React.ReactNode;
  /**
   * Optional status row rendered to the right of the back button.
   * Used for the "Continuing with '{prompt}'" intent hint.
   */
  readonly statusRow?: React.ReactNode;
  /** aria-label for the dialog element. Defaults to "Authentication". */
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
  backButtonLabel = 'Go back',
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
      onMouseDown={onBackdropMouseDown}
      className='jovie-auth-modal fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-fit max-h-[calc(100svh-48px)] w-[calc(100%-32px)] max-w-[400px] overflow-auto rounded-2xl border border-white/[0.08] bg-[var(--color-bg-surface-3,#2a2c32)] p-5 text-primary-token shadow-[0_5px_50px_rgba(0,0,0,0.5),0_4px_30px_rgba(0,0,0,0.4)] backdrop:bg-black/60 backdrop:backdrop-blur-sm'
    >
      <div className='mb-2 flex items-center'>
        <button
          type='button'
          onClick={dismiss}
          aria-label={backButtonLabel}
          className='inline-flex h-8 w-8 items-center justify-center rounded-full text-secondary-token transition-colors hover:bg-white/[0.08] hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
        >
          <ArrowLeft className='h-4 w-4' strokeWidth={2} aria-hidden='true' />
        </button>
      </div>
      {statusRow ? (
        <div className='mb-3 px-1 text-center text-[12px] leading-[1.4] text-tertiary-token'>
          {statusRow}
        </div>
      ) : null}
      {children}
    </dialog>
  );
}
