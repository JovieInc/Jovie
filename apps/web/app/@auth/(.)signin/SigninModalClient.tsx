'use client';

import { useSearchParams } from 'next/navigation';
import { AuthModalShell } from '@/components/auth/AuthModalShell';
import { AuthenticatedAuthEntryGuard } from '@/components/features/auth/AuthenticatedAuthEntryGuard';
import { AuthOfferSummary } from '@/components/features/auth/AuthOfferSummary';
import { AuthShell } from '@/components/features/auth/AuthShell';
import { APP_ROUTES } from '@/constants/routes';
import { resolveAuthShellBackLink } from '@/lib/auth/auth-shell-intent';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';

/**
 * Intercepted sign-in modal.
 *
 * Soft navigations to `/signin` from the homepage/header render this over the
 * current page. Hard reloads still use the full `(auth)/signin` route.
 */
export function SigninModalClient({
  showOfferSummary = false,
}: Readonly<{
  readonly showOfferSummary?: boolean;
}> = {}) {
  const searchParams = useSearchParams();
  const signUpUrl = buildAuthRouteUrl(APP_ROUTES.SIGNUP, searchParams);
  const redirectUrl =
    sanitizeRedirectUrl(searchParams.get('redirect_url')) ??
    APP_ROUTES.DASHBOARD;
  // JOV-6225: bind the visible back label to the same validated entry
  // context that decides its destination. Claim-origin sign-ins promise
  // "Back to @handle" and land on the claim surface; everything else
  // promises "Back to homepage" and lands on the homepage.
  const backLink = resolveAuthShellBackLink(searchParams);

  return (
    <AuthenticatedAuthEntryGuard>
      <AuthModalShell
        ariaLabel='Log in to Jovie'
        backButtonLabel={backLink?.label ?? 'Back to homepage'}
        backDestination={backLink?.href ?? APP_ROUTES.HOME}
      >
        {showOfferSummary ? <AuthOfferSummary mode='sign-in' enabled /> : null}
        <AuthShell
          mode='sign-in'
          compact
          oppositeModeUrl={signUpUrl}
          fallbackRedirectUrl={redirectUrl}
        />
      </AuthModalShell>
    </AuthenticatedAuthEntryGuard>
  );
}
