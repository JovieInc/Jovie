import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { getAuthenticatedAuthRouteRedirect } from '@/lib/auth/access-route-redirect';
import { readAuthOfferHandoff } from '@/lib/auth/auth-shell-offer';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';
import { SigninModalClient } from './SigninModalClient';

export default async function SigninModalPage({
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
  const authResult = await resolveUserState({ createDbUserIfMissing: false });

  if (authResult.state !== CanonicalUserState.UNAUTHENTICATED) {
    redirect(
      getAuthenticatedAuthRouteRedirect(authResult.state, {
        redirectUrl,
        authState,
        offerHandoff: readAuthOfferHandoff({
          get: key =>
            typeof params[key] === 'string' ? (params[key] as string) : null,
        }),
        isPaidSubscriber: authResult.context?.isPro ?? false,
      })
    );
  }

  return (
    <Suspense fallback={null}>
      <SigninModalClient />
    </Suspense>
  );
}
