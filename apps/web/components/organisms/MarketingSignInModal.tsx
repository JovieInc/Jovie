'use client';

import { ClerkProvider, SignIn } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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

  useEffect(() => {
    setMounted(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  // Portal to <body> so the modal escapes the marketing header's
  // backdrop-filter containing block (which would otherwise shrink
  // a `position: fixed` descendant to the header's bounds).
  return createPortal(
    <ClerkProvider appearance={clerkDarkCompact}>
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
          <div className='pointer-events-auto w-full max-w-[400px]'>
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
