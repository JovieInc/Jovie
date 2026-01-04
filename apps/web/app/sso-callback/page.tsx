'use client';

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';

/**
 * Root SSO callback page for OAuth flows.
 * Uses Clerk's built-in component to handle the redirect callback.
 * The app layout will handle state resolution (waitlist, onboarding, dashboard).
 */
export default function SsoCallbackPage() {
  return (
    <div className='flex items-center justify-center min-h-[200px]'>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl='/app/dashboard'
        signUpFallbackRedirectUrl='/onboarding?fresh_signup=true'
      />
    </div>
  );
}
