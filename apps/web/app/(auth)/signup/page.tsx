import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { getAuthenticatedAuthEntryRedirectFromParams } from '@/lib/auth/access-route-redirect';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';
import { SignUpPageClient } from './SignUpPageClient';

export const dynamic = 'force-dynamic';

/**
 * Sign-up page using the canonical AuthShell (JOV-2064).
 *
 * The page and the intercepted modal route at `/@auth/(.)signup` render the
 * same AuthShell, so copy, links, and provider list cannot drift. Provider
 * buttons are gated by `lib/auth/oauth-providers.ts` — Apple stays hidden
 * until its env flag is set (JOV-2062).
 *
 * Signed-in visitors are redirected here (server) and again by
 * `AuthenticatedAuthEntryGuard` after hydration, matching `/signin`.
 */
export default async function SignUpPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const authResult = await resolveUserState({ createDbUserIfMissing: false });
  if (authResult.state !== CanonicalUserState.UNAUTHENTICATED) {
    redirect(
      getAuthenticatedAuthEntryRedirectFromParams(authResult.state, params, {
        isPaidSubscriber: authResult.context?.isPro ?? false,
      })
    );
  }

  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <SignUpPageClient />
    </Suspense>
  );
}
