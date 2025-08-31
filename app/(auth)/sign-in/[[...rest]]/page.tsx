'use client';

import { ClerkLoaded, ClerkLoading, SignIn } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import React from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';

class SignInErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className='mt-4 text-center text-sm text-red-600 dark:text-red-400'>
          Sign in failed. Please try again.
        </div>
      );
    }

    return this.props.children;
  }
}

export default function SignInPage() {
  const searchParams = useSearchParams();

  // Check for redirect_url parameter (e.g., from protected pages like /onboarding)
  const redirectUrl = searchParams?.get('redirect_url') ?? null;

  // Check for artistId parameter (legacy flow)
  const artistId = searchParams?.get('artistId') ?? null;

  // Determine destination: prioritize redirect_url, then artistId flow, then default to dashboard
  const destination =
    redirectUrl ||
    (artistId ? `/dashboard?artistId=${artistId}` : '/dashboard');

  return (
    <div className='flex min-h-screen items-center justify-center bg-white dark:bg-[#0D0E12] transition-colors'>
      <ClerkLoading>
        <div data-testid='spinner'>
          <LoadingSpinner size='lg' />
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <SignInErrorBoundary>
          <SignIn
            redirectUrl={destination}
            afterSignInUrl={destination}
            afterSignUpUrl={destination}
            signUpUrl='/sign-up'
          />
        </SignInErrorBoundary>
      </ClerkLoaded>
    </div>
  );
}
