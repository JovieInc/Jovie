'use client';

import { ClerkLoaded, ClerkLoading, SignIn } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { SignInErrorBoundary } from '@/components/auth';
import { getSafeRedirectUrl } from '@/lib/auth/redirect-validation';

export default function SignInPage() {
  const searchParams = useSearchParams();

  // Get safe redirect URL with validation
  const redirectUrl = searchParams?.get('redirect_url') ?? null;
  const artistId = searchParams?.get('artistId') ?? null;
  
  const destination = getSafeRedirectUrl(redirectUrl, artistId);

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
