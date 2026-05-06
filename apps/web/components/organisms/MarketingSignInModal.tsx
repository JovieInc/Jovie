'use client';

import { ClerkProvider, SignIn } from '@clerk/nextjs';
import { ui } from '@clerk/ui';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getClerkProxyUrl } from '@/components/providers/clerkAvailability';
import { APP_ROUTES } from '@/constants/routes';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';

interface MarketingSignInModalProps {
  readonly onClose: () => void;
}

/**
 * Compact Clerk appearance aligned with the full auth split view and the
 * intercepted auth modal shell. Keep this limited to stable surface tokens so
 * Clerk's internal step/error states can render without layout surprises.
 */
const clerkDarkCompact = {
  variables: {
    colorBackground: '#090a0c',
    colorForeground: '#f5f5f7',
    colorPrimary: '#ffffff',
    colorPrimaryForeground: '#08090a',
    colorMuted: '#14161a',
    colorMutedForeground: '#a1a1aa',
    colorInput: '#101216',
    colorInputForeground: '#f5f5f7',
    colorBorder: 'rgba(255,255,255,0.1)',
    colorRing: 'rgba(255,255,255,0.24)',
    borderRadius: '0.95rem',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'shadow-none',
    card: 'bg-[#090a0c]/95 border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_34px_90px_rgba(0,0,0,0.42)]',
  },
} as const;

/**
 * Reserved-size loading placeholder that mirrors the final Clerk compact
 * card layout (header, OAuth row, divider, input, primary button, footer
 * link). Absolutely positioned so Clerk's real card mounts on top without
 * reflow — eliminates the small-then-layoutshift flash on cold loads.
 */
function SignInSkeleton() {
  return (
    <div
      aria-hidden='true'
      data-testid='marketing-signin-skeleton'
      className='absolute inset-0 flex flex-col gap-4 rounded-[0.95rem] border border-white/10 bg-[#090a0c]/95 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_34px_90px_rgba(0,0,0,0.42)]'
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

export function MarketingSignInModal({
  onClose,
}: Readonly<MarketingSignInModalProps>) {
  const [mounted, setMounted] = useState(false);
  const [clerkReady, setClerkReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    // Remember the element that opened the modal so focus can return on
    // close. Typically the marketing-header "Sign in" button.
    previouslyFocusedRef.current =
      (document.activeElement as HTMLElement | null) ?? null;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      // Focus trap: cycle tab order inside the modal so keyboard users
      // can't escape to the page behind the backdrop.
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
    // Snapshot the current URL hash so we can restore it if Clerk's
    // `routing='hash'` writes step fragments (e.g. `#/sign-in/factor-one`)
    // that would otherwise stick around when the modal is dismissed.
    const previousHash = globalThis.location.hash;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (globalThis.location.hash !== previousHash) {
        const url = `${globalThis.location.pathname}${globalThis.location.search}${previousHash}`;
        globalThis.history.replaceState(null, '', url);
      }
      // Restore focus to whatever triggered the modal.
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [onClose]);

  // Move focus into the modal once Clerk mounts its form. Clerk renders
  // async (bundles + network), so watch the container with a
  // MutationObserver and focus the first input as soon as it appears.
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
    // Safety: stop watching after 5s even if Clerk never rendered.
    const timeout = globalThis.setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      globalThis.clearTimeout(timeout);
    };
  }, [mounted]);

  if (!mounted) return null;

  const currentSearchParams = new URLSearchParams(globalThis.location.search);
  const signUpUrl = buildAuthRouteUrl(APP_ROUTES.SIGNUP, currentSearchParams);

  // Portal to <body> so the modal escapes the marketing header's
  // backdrop-filter containing block (which would otherwise shrink
  // a `position: fixed` descendant to the header's bounds).
  //
  // proxyUrl routes Clerk traffic through the /__clerk middleware proxy
  // exactly like ClientProviders + AuthClientProviders. Without it, prod
  // (pk_live_) sign-ins bypass the proxy and break the FAPI host contract
  // documented in CLAUDE.md.
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
        aria-label='Sign in to Jovie'
        className='fixed inset-0 z-[100]'
      >
        <button
          type='button'
          aria-label='Close sign in'
          onClick={onClose}
          className='absolute inset-0 bg-black/70 backdrop-blur-sm'
        />
        <div className='pointer-events-none absolute inset-0 flex items-center justify-center p-4'>
          <div
            ref={containerRef}
            data-testid='marketing-signin-card'
            className='pointer-events-auto relative w-full max-w-[420px] overflow-hidden rounded-[1.65rem] border border-white/10 bg-[#07080a]/[0.94] p-3 shadow-[0_40px_120px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-[2px]'
            style={{ minHeight: 520 }}
          >
            <div
              aria-hidden='true'
              className='pointer-events-none absolute inset-0'
            >
              <div className='absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(82,142,232,0.28),transparent_68%)] blur-3xl' />
              <div className='absolute -bottom-28 -right-24 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(92,185,206,0.18),transparent_70%)] blur-3xl' />
              <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent_34%,rgba(0,0,0,0.3))]' />
            </div>
            <button
              type='button'
              aria-label='Close'
              onClick={onClose}
              className='absolute right-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
            >
              <X className='h-4 w-4' strokeWidth={2} />
            </button>
            <div className='relative z-10 min-h-[496px]'>
              {clerkReady ? null : <SignInSkeleton />}
              <SignIn
                appearance={clerkDarkCompact}
                routing='hash'
                signUpUrl={signUpUrl}
                fallbackRedirectUrl={APP_ROUTES.ONBOARDING}
              />
            </div>
          </div>
        </div>
      </div>
    </ClerkProvider>,
    document.body
  );
}
