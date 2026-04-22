'use client';

import { ClerkProvider, SignIn } from '@clerk/nextjs';
import { ui } from '@clerk/ui';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getClerkProxyUrl } from '@/components/providers/clerkAvailability';
import { APP_ROUTES } from '@/constants/routes';

interface MarketingSignInModalProps {
  readonly onClose: () => void;
}

/**
 * Minimal dark Clerk appearance — closer to default Clerk than the
 * full marketing/app theme. Compact card, no heavy custom element
 * overrides, so it looks like a stock Clerk modal in dark mode.
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

export function MarketingSignInModal({
  onClose,
}: Readonly<MarketingSignInModalProps>) {
  const [mounted, setMounted] = useState(false);
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
    const previousHash = window.location.hash;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (window.location.hash !== previousHash) {
        const url = `${window.location.pathname}${window.location.search}${previousHash}`;
        window.history.replaceState(null, '', url);
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
    const timeout = window.setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [mounted]);

  if (!mounted) return null;

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
            className='pointer-events-auto relative w-full max-w-[400px]'
          >
            <button
              type='button'
              aria-label='Close'
              onClick={onClose}
              className='absolute right-2 top-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30'
            >
              <X className='h-4 w-4' strokeWidth={2} />
            </button>
            <SignIn
              appearance={clerkDarkCompact}
              routing='hash'
              signUpUrl={APP_ROUTES.SIGNUP}
              fallbackRedirectUrl={APP_ROUTES.ONBOARDING}
            />
          </div>
        </div>
      </div>
    </ClerkProvider>,
    document.body
  );
}
