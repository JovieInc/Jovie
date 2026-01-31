'use client';

import { SsoCallbackHandler } from '@/components/auth/SsoCallbackHandler';

/**
 * SSO callback page for sign-up OAuth flows.
 * proxy.ts handles all routing based on user state (waitlist, onboarding, etc.).
 */
export default function SignUpSsoCallbackPage() {
  return (
    <div className='flex items-center justify-center min-h-[200px]'>
      <SsoCallbackHandler
        signInFallbackRedirectUrl='/'
        signUpFallbackRedirectUrl='/onboarding'
      />
    </div>
  );
}
