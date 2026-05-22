'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { SsoCallbackHandler } from '@/features/auth/SsoCallbackHandler';
import { buildDesktopCallbackFallbackRedirectUrl } from '@/lib/desktop/auth-return';

/**
 * SSO callback page for sign-up OAuth flows.
 * proxy.ts handles all routing based on user state (waitlist, onboarding, etc.).
 */
export default function SignUpSsoCallbackPage() {
  const searchParams = useSearchParams();
  const signInFallbackRedirectUrl = useMemo(
    () =>
      buildDesktopCallbackFallbackRedirectUrl(
        searchParams,
        APP_ROUTES.DASHBOARD
      ),
    [searchParams]
  );
  const signUpFallbackRedirectUrl = useMemo(
    () =>
      buildDesktopCallbackFallbackRedirectUrl(searchParams, APP_ROUTES.START),
    [searchParams]
  );

  return (
    <div className='min-h-dvh grid place-items-center bg-base'>
      <SsoCallbackHandler
        signInFallbackRedirectUrl={signInFallbackRedirectUrl}
        signUpFallbackRedirectUrl={signUpFallbackRedirectUrl}
      />
    </div>
  );
}
