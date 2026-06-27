import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { getAuthenticatedAuthRouteRedirect } from '@/lib/auth/access-route-redirect';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';
import { SignInPageClient } from './SignInPageClient';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = await searchParams;
  const redirectUrl =
    typeof params.redirect_url === 'string' ? params.redirect_url : null;
  const authResult = await resolveUserState({ createDbUserIfMissing: false });

  if (authResult.state !== CanonicalUserState.UNAUTHENTICATED) {
    redirect(
      getAuthenticatedAuthRouteRedirect(authResult.state, { redirectUrl })
    );
  }

  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <SignInPageClient />
    </Suspense>
  );
}
