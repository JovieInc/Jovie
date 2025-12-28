'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

/**
 * SSO callback page for sign-up OAuth flows.
 * Uses Clerk's built-in component to handle the redirect callback.
 * No longer depends on Clerk Elements.
 */
export default function SignUpSsoCallbackPage() {
  return (
    <div className='flex items-center justify-center min-h-[200px]'>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl='/app/dashboard/overview'
        signUpFallbackRedirectUrl='/onboarding'
      />
    </div>
  );
}
