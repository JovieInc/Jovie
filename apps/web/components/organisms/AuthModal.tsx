'use client';

import { ClerkProvider, SignIn, SignUp } from '@clerk/nextjs';
import { ui } from '@clerk/ui';
import { X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getClerkProxyUrl } from '@/components/providers/clerkAvailability';
import { APP_ROUTES } from '@/constants/routes';

export type AuthModalMode = 'signin' | 'signup';

interface AuthModalProps {
  /**
   * Initial mode. When not supplied, falls back to reading the
   * `?auth=` URL parameter (signin | signup), then defaults to signin.
   */
  readonly defaultMode?: AuthModalMode;
  readonly onClose: () => void;
}

/**
 * Minimal dark Clerk appearance — compact card, no heavy custom element
 * overrides, looks like a stock Clerk modal in dark mode.
 */
const clerkDarkCompact = {
  variables: {
    colorBackground: '#0a0a0c',
    colorForeground: '#f5f5f7',
    colorPrimary: '#ffffff',
    colorPrimaryForeground: '#0a0a0c',
    colorMuted: '#16161a',
    colorMutedForeground: '#a1a1aa',
    colorInput: '#111113',
    colorInputForeground: '#f5f5f7',
    colorBorder: 'rgba(255,255,255,0.08)',
    colorRing: 'rgba(255,255,255,0.24)',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'shadow-2xl',
    card: 'bg-[#0a0a0c] border border-white/10',
  },
} as const;

/**
 * Reserved-size loading placeholder that mirrors the Clerk compact card layout
 * (header, OAuth row, divider, input, primary button, footer link).
 * Absolutely positioned so Clerk's real card mounts on top without reflow —
 * eliminates the small-then-layout-shift flash on cold loads.
 */
function AuthModalSkeleton({ testId }: Readonly<{ readonly testId?: string }>) {
  return (
    <div
      aria-hidden='true'
      data-testid={testId ?? 'auth-modal-skeleton'}
      className='absolute inset-0 flex flex-col gap-4 rounded-[0.75rem] border border-white/10 bg-[#0a0a0c] p-8 shadow-2xl'
    >
      <div className='mx-auto h-6 w-40 animate-pulse rounded bg-white/10' />
      <div className='mx-auto mt-1 h-3 w-56 animate-pulse rounded bg-white/5' />
      <div className='mt-5 grid grid-cols-3 gap-2'>
        <div className='h-10 animate-pulse rounded-md bg-white/5' />
        <div className='h-10 animate-pulse rounded-md bg-white/5' />
        <div className='h-10 animate-pulse rounded-md bg-white/5' />
      </div>
      <div className='my-1 flex items-center gap-3'>
        <div className='h-px flex-1 bg-white/10' />
        <div className='h-2 w-6 rounded bg-white/5' />
        <div className='h-px flex-1 bg-white/10' />
      </div>
      <div className='h-3 w-20 animate-pulse rounded bg-white/10' />
      <div className='h-10 animate-pulse rounded-md bg-white/[0.04]' />
      <div className='mt-1 h-10 animate-pulse rounded-md bg-white/15' />
      <div className='mx-auto mt-auto h-3 w-44 animate-pulse rounded bg-white/5' />
    </div>
  );
}

/**
 * Inner component that reads URL params (requires Suspense boundary).
 */
function AuthModalInner({ defaultMode, onClose }: Readonly<AuthModalProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derive initial mode: prop → URL param → default
  const urlMode = searchParams.get('auth') as AuthModalMode | null;
  const resolvedInitialMode: AuthModalMode =
    defaultMode ?? (urlMode === 'signup' ? 'signup' : 'signin');

  const [mode, setMode] = useState<AuthModalMode>(resolvedInitialMode);
  const [mounted, setMounted] = useState(false);
  const [clerkReady, setClerkReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Close the modal and clean up the ?auth= URL param
  const handleClose = useCallback(() => {
    const url = new URL(globalThis.location.href);
    if (url.searchParams.has('auth')) {
      url.searchParams.delete('auth');
      router.replace(`${url.pathname}${url.search}${url.hash}`);
    }
    onClose();
  }, [onClose, router]);

  // Toggle mode without unmounting the portal — preserves Clerk state (email prefill)
  const toggleMode = useCallback(() => {
    setClerkReady(false);
    setMode(prev => (prev === 'signin' ? 'signup' : 'signin'));
  }, []);

  useEffect(() => {
    setMounted(true);
    previouslyFocusedRef.current =
      (document.activeElement as HTMLElement | null) ?? null;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
        return;
      }
      if (event.key !== 'Tab') return;
      // Focus trap: cycle tab order inside the modal
      const root = containerRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inModal = active ? root.contains(active) : false;
      if (!inModal) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previousHash = globalThis.location.hash;

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (globalThis.location.hash !== previousHash) {
        const url = `${globalThis.location.pathname}${globalThis.location.search}${previousHash}`;
        globalThis.history.replaceState(null, '', url);
      }
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [handleClose]);

  // Move focus into the modal once Clerk mounts its form
  useEffect(() => {
    if (!mounted) return;
    const container = containerRef.current;
    if (!container) return;

    const focusFirstInput = () => {
      const input = container.querySelector<HTMLInputElement>(
        'input[type="email"], input[name="identifier"], input[type="text"]'
      );
      if (input) {
        input.focus();
        setClerkReady(true);
        return true;
      }
      return false;
    };

    if (focusFirstInput()) return;

    const observer = new MutationObserver(() => {
      if (focusFirstInput()) observer.disconnect();
    });
    observer.observe(container, { childList: true, subtree: true });
    const timeout = globalThis.setTimeout(() => {
      observer.disconnect();
      setClerkReady(true);
    }, 5000);
    return () => {
      observer.disconnect();
      globalThis.clearTimeout(timeout);
    };
  }, [mounted, mode]);

  if (!mounted) return null;

  const isSignIn = mode === 'signin';
  const ariaLabel = isSignIn ? 'Sign in to Jovie' : 'Create your Jovie account';

  return createPortal(
    <ClerkProvider
      appearance={clerkDarkCompact}
      ui={ui}
      proxyUrl={getClerkProxyUrl(globalThis.location)}
      signInUrl={APP_ROUTES.SIGNIN}
      signUpUrl={APP_ROUTES.SIGNUP}
      signInFallbackRedirectUrl={APP_ROUTES.ONBOARDING}
    >
      <div
        role='dialog'
        aria-modal='true'
        aria-label={ariaLabel}
        className='fixed inset-0 z-[100]'
      >
        {/* Backdrop */}
        <button
          type='button'
          aria-label='Close'
          onClick={handleClose}
          className='absolute inset-0 bg-black/70 backdrop-blur-sm'
        />

        {/* Modal container — centered, compact, responsive */}
        <div className='pointer-events-none absolute inset-0 flex items-center justify-center px-4 py-4'>
          <div
            ref={containerRef}
            className='pointer-events-auto relative w-full max-w-[420px]'
            style={{
              maxHeight: 'min(560px, calc(100svh - 32px))',
            }}
          >
            {/* Skeleton placeholder — prevents layout shift while Clerk loads */}
            {clerkReady ? null : (
              <AuthModalSkeleton testId='auth-modal-skeleton' />
            )}

            {/* Close button */}
            <button
              type='button'
              aria-label='Close'
              onClick={handleClose}
              className='absolute right-2 top-2 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
            >
              <X className='h-4 w-4' strokeWidth={2} />
            </button>

            {/* Clerk form — SignIn or SignUp based on mode */}
            {isSignIn ? (
              <SignIn
                appearance={clerkDarkCompact}
                routing='hash'
                signUpUrl={APP_ROUTES.SIGNUP}
                fallbackRedirectUrl={APP_ROUTES.ONBOARDING}
              />
            ) : (
              <SignUp
                appearance={clerkDarkCompact}
                routing='hash'
                signInUrl={APP_ROUTES.SIGNIN}
                fallbackRedirectUrl={APP_ROUTES.WAITLIST}
              />
            )}

            {/* Mode toggle — switches without unmounting portal */}
            <div className='mt-3 flex justify-center'>
              <button
                type='button'
                onClick={toggleMode}
                className='text-[12px] text-white/50 transition-colors hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-sm px-1'
              >
                {isSignIn
                  ? 'Need an account? Sign up'
                  : 'Have an account? Sign in'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ClerkProvider>,
    document.body
  );
}

/**
 * Canonical auth modal for Jovie marketing surfaces.
 *
 * Supports both sign-in and sign-up modes with an internal toggle that
 * preserves Clerk state (email prefill) across switches. URL parameter
 * integration: `?auth=signin` or `?auth=signup` opens the modal in the
 * right mode. Closing removes the param via `router.replace`.
 *
 * Sizing: `w-full max-w-[420px]`, `max-h-[min(560px,calc(100svh-32px))]`,
 * `px-4` on viewports <420px so it never bleeds to edge. Stays compact at
 * ultra-wide (1920–3440px) — a focused dialog, not a stranded card.
 *
 * Portal-rendered to `<body>` to escape any `backdrop-filter` containing
 * blocks in the header.
 */
export function AuthModal(props: Readonly<AuthModalProps>) {
  return (
    <Suspense fallback={null}>
      <AuthModalInner {...props} />
    </Suspense>
  );
}
