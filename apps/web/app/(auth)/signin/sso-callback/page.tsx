'use client';

import { SsoCallbackHandler } from '@/components/auth/SsoCallbackHandler';

/**
 * SSO callback page for sign-in OAuth flows.
 * Uses custom handler to manage Clerk's redirect callback and handle
 * unexpected hash fragments (like #reset-password) that may occur
 * when Clerk detects certain account states.
 *
 * For fresh signups that happen through sign-in flow, adds fresh_signup flag.
 */
export default function SignInSsoCallbackPage() {
  return (
    <div className='flex items-center justify-center min-h-[200px]'>
      <SsoCallbackHandler
        signInFallbackRedirectUrl='/app/dashboard'
        signUpFallbackRedirectUrl='/onboarding?fresh_signup=true'
      />
    </div>
  );
}
