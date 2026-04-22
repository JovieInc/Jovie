'use client';

import { SignUp } from '@clerk/nextjs';
import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { readHomepageIntent } from '@/components/homepage/intent-store';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { APP_ROUTES } from '@/constants/routes';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';

/**
 * Intercepted signup modal.
 *
 * Activates on desktop (≥768px) when `router.push('/signup?...')` is called
 * from a same-origin page. Renders the Clerk `<SignUp />` card over a dimmed
 * homepage. Chat DOM stays mounted behind — parallel routes keep `children`
 * intact while this slot renders.
 *
 * Dismissal: Escape, backdrop click, or browser-back.
 * Refresh on /signup renders the full-page /signup instead (intercepts don't
 * survive reload).
 */
function SignupModalBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [promptHint, setPromptHint] = useState<string | null>(null);

  // Mirror the signin page's pattern: skeleton-first, Clerk mounts on client only.
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Hydrate the intent hint from localStorage (text only — the load-bearing
  // restoration happens on /onboarding after the OAuth round-trip).
  useEffect(() => {
    const intentId = searchParams.get('intent_id');
    if (!intentId) return;
    const intent = readHomepageIntent(intentId);
    if (intent) setPromptHint(intent.finalPrompt);
  }, [searchParams]);

  // Open as native modal for focus-trap + Escape behavior at no React cost.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const dismiss = useCallback(() => {
    router.back();
  }, [router]);

  // Native <dialog> emits `close` when Escape is pressed or close() is called.
  // Hook it to actual navigation so the URL stays in sync.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onClose = () => {
      // Only navigate if the close wasn't triggered by our own unmount.
      if (globalThis.location.pathname === APP_ROUTES.SIGNUP) {
        router.back();
      }
    };
    dialog.addEventListener('close', onClose);
    return () => dialog.removeEventListener('close', onClose);
  }, [router]);

  const onBackdropMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      // Native dialog backdrop click targets the dialog element itself. Only
      // dismiss if the click originated on the backdrop, not on card content.
      if (event.target === dialogRef.current) dismiss();
    },
    [dismiss]
  );

  const signInUrl = buildAuthRouteUrl(APP_ROUTES.SIGNIN, searchParams);
  const redirectUrl = searchParams.get('redirect_url') ?? APP_ROUTES.ONBOARDING;

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: native <dialog> opened via showModal() is interactive; the mouseDown is the documented way to detect ::backdrop clicks.
    <dialog
      ref={dialogRef}
      aria-label='Create your Jovie account'
      onMouseDown={onBackdropMouseDown}
      className='jovie-auth-modal fixed inset-0 m-auto h-auto max-h-[calc(100svh-48px)] w-full max-w-[440px] overflow-auto rounded-2xl border border-white/[0.08] bg-[var(--color-bg-surface-3,#2a2c32)] p-6 text-primary-token shadow-[0_5px_50px_rgba(0,0,0,0.5),0_4px_30px_rgba(0,0,0,0.4)] backdrop:bg-black/60 backdrop:backdrop-blur-sm'
    >
      <div className='mb-4 flex items-start justify-between gap-4'>
        <button
          type='button'
          onClick={dismiss}
          aria-label='Back to chat'
          className='inline-flex h-8 w-8 items-center justify-center rounded-full text-secondary-token transition-colors hover:bg-white/[0.08] hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20'
        >
          <ArrowLeft className='h-4 w-4' strokeWidth={2} aria-hidden='true' />
        </button>
        {promptHint ? (
          <p
            aria-live='polite'
            className='flex-1 text-right text-[13px] leading-[1.4] text-tertiary-token'
            title={promptHint}
          >
            Continuing with &ldquo;
            {promptHint.length > 48
              ? `${promptHint.slice(0, 48)}…`
              : promptHint}
            &rdquo;
          </p>
        ) : null}
      </div>

      {isMounted ? (
        <SignUp
          routing='hash'
          oauthFlow='redirect'
          signInUrl={signInUrl}
          fallbackRedirectUrl={redirectUrl}
        />
      ) : (
        <AuthFormSkeleton />
      )}
    </dialog>
  );
}

export default function SignupModalPage() {
  return (
    <Suspense fallback={null}>
      <SignupModalBody />
    </Suspense>
  );
}
