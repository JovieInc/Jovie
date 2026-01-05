'use client';

import { SsoCallbackHandler } from '@/components/auth/SsoCallbackHandler';

/**
 * SSO callback page for sign-up OAuth flows.
 * Uses custom handler to manage Clerk's redirect callback and handle
 * unexpected hash fragments (like #reset-password) that may occur
 * when Clerk detects certain account states.
 *
 * The app layout will handle state resolution (waitlist, onboarding, dashboard).
 */
export default function SignUpSsoCallbackPage() {
  return (
    <div className='flex items-center justify-center min-h-[200px]'>
      <SsoCallbackHandler
        signInFallbackRedirectUrl='/app/dashboard'
        signUpFallbackRedirectUrl='/onboarding?fresh_signup=true'
      />
    </div>
  );
}
