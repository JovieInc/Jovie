'use client';

import { AuthenticateWithRedirectCallback, useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * SSO callback page for sign-up OAuth flows.
 * Detects fresh signups and adds fresh_signup=true flag to prevent redirect loops.
 * Uses Clerk's built-in component to handle the redirect callback.
 */
export default function SignUpSsoCallbackPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && user) {
      // Check if this is a new signup (user just created)
      // If createdAt is null, treat as existing user (safer default)
      if (user.createdAt) {
        const createdAt = new Date(user.createdAt);
        const now = new Date();
        const ageInSeconds = (now.getTime() - createdAt.getTime()) / 1000;

        // If user was created in last 30 seconds, treat as fresh signup
        // This matches the email OTP flow behavior in useSignUpFlow.ts
        if (ageInSeconds < 30) {
          router.push('/onboarding?fresh_signup=true');
          return;
        }
      }

      // Existing user - redirect to dashboard
      router.push('/app/dashboard/overview');
    }
  }, [isLoaded, isSignedIn, user, router]);

  return (
    <div className='flex items-center justify-center min-h-[200px]'>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl='/app/dashboard/overview'
        signUpFallbackRedirectUrl='/onboarding?fresh_signup=true'
      />
    </div>
  );
}
