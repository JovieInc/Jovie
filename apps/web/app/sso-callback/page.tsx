'use client';

import { SsoCallbackHandler } from '@/components/auth/SsoCallbackHandler';

/**
 * Root SSO callback page for OAuth flows.
 * proxy.ts handles all routing based on user state (waitlist, onboarding, etc.).
 */
export default function SsoCallbackPage() {
  return (
    <div className='flex items-center justify-center min-h-[200px]'>
      <SsoCallbackHandler
        signInFallbackRedirectUrl='/'
        signUpFallbackRedirectUrl='/onboarding'
      />
    </div>
  );
}
