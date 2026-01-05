'use client';

import { SsoCallbackHandler } from '@/components/auth/SsoCallbackHandler';

/**
 * Root SSO callback page for OAuth flows.
 * SIMPLIFIED: No more fresh_signup flags - proxy.ts handles all routing.
 */
export default function SsoCallbackPage() {
  return (
    <div className='flex items-center justify-center min-h-[200px]'>
      <SsoCallbackHandler
        signInFallbackRedirectUrl='/app/dashboard'
        signUpFallbackRedirectUrl='/app/dashboard'
      />
    </div>
  );
}
