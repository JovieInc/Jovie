import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { getAuthenticatedAuthRouteRedirect } from '@/lib/auth/access-route-redirect';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';
import { SignUpPageClient } from './SignUpPageClient';

export const dynamic = 'force-dynamic';

/**
 * Sign-up page using the canonical AuthShell (JOV-2064).
 *
 * The page and the intercepted modal route at `/@auth/(.)signup` render the
 * same AuthShell, so copy, links, and provider list cannot drift. Provider
 * buttons are gated by `lib/auth/oauth-providers.ts`.
 *
 * Signed-in visitors are redirected here on the server, matching `/signin`
 * (JOV-6450). Soft client navigations still mount the client entry guard so a
 * stale RSC payload cannot leave a blank auth surface.
 */
export default async function SignUpPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const redirectUrl =
    typeof params.redirect_url === 'string' ? params.redirect_url : null;
  const authState =
    typeof params.auth_state === 'string' ? params.auth_state : null;
  const authResult = await resolveUserState({ createDbUserIfMissing: false });

  if (authResult.state !== CanonicalUserState.UNAUTHENTICATED) {
    redirect(
      getAuthenticatedAuthRouteRedirect(authResult.state, {
        redirectUrl,
        authState,
      })
    );
  }

  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <SignUpPageClient />
    </Suspense>
  );
}
