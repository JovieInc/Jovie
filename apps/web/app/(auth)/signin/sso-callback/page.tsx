'use client';

import { SsoCallbackHandler } from '@/components/auth/SsoCallbackHandler';

/**
 * SSO callback page for sign-in OAuth flows.
 * SIMPLIFIED: No more fresh_signup flags - proxy.ts handles all routing.
 *
 * Note: OAuth callbacks now happen on app.jov.ie (via absolute URLs in useSignInFlow),
 * so we use '/' as the redirect URL which is the dashboard on this domain.
 */
export default function SignInSsoCallbackPage() {
  return (
    <div className='flex items-center justify-center min-h-[200px]'>
      <SsoCallbackHandler
        signInFallbackRedirectUrl='/'
        signUpFallbackRedirectUrl='/'
      />
    </div>
  );
}
