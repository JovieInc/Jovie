'use client';

import { SsoCallbackHandler } from '@/components/auth/SsoCallbackHandler';

/**
 * SSO callback page for sign-up OAuth flows.
 * SIMPLIFIED: No more fresh_signup flags - proxy.ts handles all routing.
 */
export default function SignUpSsoCallbackPage() {
  return (
    <div className='flex items-center justify-center min-h-[200px]'>
      <SsoCallbackHandler
        signInFallbackRedirectUrl='/app/dashboard'
        signUpFallbackRedirectUrl='/app/dashboard'
      />
    </div>
  );
}
