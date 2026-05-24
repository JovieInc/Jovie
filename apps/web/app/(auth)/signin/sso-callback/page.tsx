'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { SsoCallbackHandler } from '@/features/auth/SsoCallbackHandler';
import { getCentralAuthCallbackPath } from '@/lib/auth/central-auth-routing';
import { buildDesktopCallbackFallbackRedirectUrl } from '@/lib/desktop/auth-return';

/**
 * SSO callback page for sign-in OAuth flows.
 * proxy.ts handles all routing based on user state (waitlist, onboarding, etc.).
 */
export default function SignInSsoCallbackPage() {
  const searchParams = useSearchParams();
  const signInFallbackRedirectUrl = useMemo(
    () =>
      getCentralAuthCallbackPath(searchParams) ??
      buildDesktopCallbackFallbackRedirectUrl(
        searchParams,
        APP_ROUTES.DASHBOARD
      ),
    [searchParams]
  );
  const signUpFallbackRedirectUrl = useMemo(
    () =>
      getCentralAuthCallbackPath(searchParams) ??
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
