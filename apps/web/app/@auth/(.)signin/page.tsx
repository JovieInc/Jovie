import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { getAuthenticatedAuthEntryRedirectFromParams } from '@/lib/auth/access-route-redirect';
import { CanonicalUserState, resolveUserState } from '@/lib/auth/gate';
import { SigninModalClient } from './SigninModalClient';

export default async function SigninModalPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  await connection();
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
    <Suspense fallback={null}>
      <SigninModalClient />
    </Suspense>
  );
}
