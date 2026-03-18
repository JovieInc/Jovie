'use client';

import { APP_ROUTES } from '@/constants/routes';
import { SsoCallbackHandler } from '@/features/auth/SsoCallbackHandler';

/**
 * SSO callback page for sign-up OAuth flows.
 * proxy.ts handles all routing based on user state (waitlist, onboarding, etc.).
 */
export default function SignUpSsoCallbackPage() {
  return (
    <div className='min-h-dvh grid place-items-center bg-base'>
      <SsoCallbackHandler
        signInFallbackRedirectUrl={APP_ROUTES.ONBOARDING}
        signUpFallbackRedirectUrl={APP_ROUTES.ONBOARDING}
      />
    </div>
  );
}
