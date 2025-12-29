'use client';

import { AuthLayout } from '@/components/auth';

interface WaitlistSuccessViewProps {
  isSigningOut: boolean;
  onSignOut: () => void;
}

export function WaitlistSuccessView({
  isSigningOut,
  onSignOut,
}: WaitlistSuccessViewProps) {
  return (
    <AuthLayout
      formTitle="You're on the waitlist!"
      showLogo={false}
      showFooterPrompt={false}
      formTitleClassName='text-lg font-medium text-primary-token mb-4 text-center'
    >
      <p className='text-sm text-secondary-token text-center'>
        Early access is rolling out in stages.
      </p>

      <div className='flex items-center justify-center pt-6'>
        <button
          type='button'
          onClick={onSignOut}
          disabled={isSigningOut}
          className='text-sm text-secondary-token hover:text-primary-token transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-ring-themed rounded-md px-2 py-1'
        >
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </AuthLayout>
  );
}
