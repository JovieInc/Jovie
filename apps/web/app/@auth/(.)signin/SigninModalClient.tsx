'use client';

import { useSearchParams } from 'next/navigation';
import { AuthModalShell } from '@/components/auth/AuthModalShell';
import { AuthShell } from '@/components/features/auth/AuthShell';
import { APP_ROUTES } from '@/constants/routes';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';

/**
 * Intercepted sign-in modal.
 *
 * Soft navigations to `/signin` from the homepage/header render this over the
 * current page. Hard reloads still use the full `(auth)/signin` route.
 */
export function SigninModalClient() {
  const searchParams = useSearchParams();
  const signUpUrl = buildAuthRouteUrl(APP_ROUTES.SIGNUP, searchParams);
  const redirectUrl =
    sanitizeRedirectUrl(searchParams.get('redirect_url')) ??
    APP_ROUTES.DASHBOARD;

  return (
    <AuthModalShell ariaLabel='Sign in to Jovie'>
      <AuthShell
        mode='sign-in'
        compact
        oppositeModeUrl={signUpUrl}
        fallbackRedirectUrl={redirectUrl}
      />
    </AuthModalShell>
  );
}
