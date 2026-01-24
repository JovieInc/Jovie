'use client';

import { SsoCallbackHandler } from '@/components/auth/SsoCallbackHandler';

/**
 * SSO callback page for sign-up OAuth flows.
 * SIMPLIFIED: No more fresh_signup flags - proxy.ts handles all routing.
 *
 * Note: OAuth callbacks now happen on app.jov.ie (via absolute URLs in useSignUpFlow),
 * so we use '/' for sign-in and '/onboarding' for sign-up as redirect URLs.
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
