import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { getAuthenticatedAuthRouteRedirect } from '@/lib/auth/access-route-redirect';
import { readAuthOfferHandoff } from '@/lib/auth/auth-shell-offer';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';
import { SignupModalClient } from './SignupModalClient';

export default async function SignupModalPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  await connection();
  const params = await searchParams;
  const get = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : null;
  const authResult = await resolveUserState({ createDbUserIfMissing: false });
  if (authResult.state !== CanonicalUserState.UNAUTHENTICATED) {
    redirect(
      getAuthenticatedAuthRouteRedirect(authResult.state, {
        redirectUrl: get('redirect_url'),
        authState: get('auth_state'),
        offerHandoff: readAuthOfferHandoff({ get }),
        isPaidSubscriber: authResult.context?.isPro ?? false,
      })
    );
  }

  return (
    <Suspense fallback={<AuthFormSkeleton />}>
      <SignupModalClient />
    </Suspense>
  );
}
