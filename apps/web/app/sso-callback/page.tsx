'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { SsoCallbackHandler } from '@/features/auth/SsoCallbackHandler';
import { getCentralAuthCallbackPath } from '@/lib/auth/central-auth-routing';
import { buildDesktopCallbackFallbackRedirectUrl } from '@/lib/desktop/auth-return';

/**
 * Root SSO callback page for OAuth flows.
 * proxy.ts handles all routing based on user state (waitlist, onboarding, etc.).
 */
export default function SsoCallbackPage() {
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
    <div className='flex items-center justify-center min-h-[200px]'>
      <SsoCallbackHandler
        signInFallbackRedirectUrl={signInFallbackRedirectUrl}
        signUpFallbackRedirectUrl={signUpFallbackRedirectUrl}
      />
    </div>
  );
}
