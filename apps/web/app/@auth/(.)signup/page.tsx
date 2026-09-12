import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { getAuthenticatedAuthRouteRedirect } from '@/lib/auth/access-route-redirect';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';
import { SignupModalClient } from './SignupModalClient';

export default async function SignupModalPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  await connection();
  const params = await searchParams;
  const redirectUrl =
    typeof params.redirect_url === 'string' ? params.redirect_url : null;
  const authState =
    typeof params.auth_state === 'string' ? params.auth_state : null;
  const plan = typeof params.plan === 'string' ? params.plan : null;
  const authResult = await resolveUserState({ createDbUserIfMissing: false });

  if (authResult.state !== CanonicalUserState.UNAUTHENTICATED) {
    redirect(
      getAuthenticatedAuthRouteRedirect(authResult.state, {
        redirectUrl,
        authState,
        plan,
      })
    );
  }

  return (
    <Suspense fallback={null}>
      <SignupModalClient />
    </Suspense>
  );
}
