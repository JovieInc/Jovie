'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

/**
 * SSO callback page for sign-in OAuth flows.
 * Uses Clerk's built-in component to handle the redirect callback.
 * For fresh signups that happen through sign-in flow, adds fresh_signup flag.
 */
export default function SignInSsoCallbackPage() {
  return (
    <div className='flex items-center justify-center min-h-[200px]'>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl='/app/dashboard/overview'
        signUpFallbackRedirectUrl='/onboarding?fresh_signup=true'
      />
    </div>
  );
}
