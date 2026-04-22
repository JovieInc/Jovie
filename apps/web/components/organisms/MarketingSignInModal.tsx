'use client';

import { ClerkProvider, SignIn } from '@clerk/nextjs';
import { useEffect } from 'react';
import { clerkAppearanceBase } from '@/components/providers/clerkAppearance';
import { APP_ROUTES } from '@/constants/routes';

interface MarketingSignInModalProps {
  readonly onClose: () => void;
}

/**
 * Scoped Clerk sign-in modal for the marketing header. Mounts its own
 * ClerkProvider on demand so the static home layout stays untouched.
 * Closes on Escape or backdrop click.
 */
export function MarketingSignInModal({
  onClose,
}: Readonly<MarketingSignInModalProps>) {
  useEffect(() => {
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

  return (
    <ClerkProvider appearance={clerkAppearanceBase}>
      <div
        role='dialog'
        aria-modal='true'
        aria-label='Sign in to Jovie'
        className='fixed inset-0 z-[100] p-4'
      >
        <button
          type='button'
          aria-label='Close sign in'
          onClick={onClose}
          className='absolute inset-0 bg-black/70 backdrop-blur-sm'
        />
        <div className='relative flex h-full items-center justify-center'>
          <SignIn
            routing='hash'
            signUpUrl={APP_ROUTES.SIGNUP}
            fallbackRedirectUrl={APP_ROUTES.ONBOARDING}
          />
        </div>
      </div>
    </ClerkProvider>
  );
}
