'use client';

import { SignIn } from '@clerk/nextjs';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AuthModalShell } from '@/components/auth/AuthModalShell';
import { AuthFormSkeleton } from '@/components/molecules/LoadingSkeleton';
import { APP_ROUTES } from '@/constants/routes';
import { buildAuthRouteUrl } from '@/lib/auth/build-auth-route-url';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';

/**
 * Intercepted signin modal.
 *
 * Pairs with the intercepted signup modal so Clerk footer links can move
 * between sign-in and sign-up without dropping the homepage/modal context.
 * Refreshing /signin still renders the full-page auth route.
 */
function SigninModalBody() {
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const signUpUrl = buildAuthRouteUrl(APP_ROUTES.SIGNUP, searchParams);
  const redirectUrl =
    sanitizeRedirectUrl(searchParams.get('redirect_url')) ??
    APP_ROUTES.DASHBOARD;

  return (
    <AuthModalShell ariaLabel='Sign in to Jovie'>
      {isMounted ? (
        <SignIn
          routing='hash'
          oauthFlow='redirect'
          signUpUrl={signUpUrl}
          fallbackRedirectUrl={redirectUrl}
        />
      ) : (
        <AuthFormSkeleton />
      )}
    </AuthModalShell>
  );
}

export default function SigninModalPage() {
  return (
    <Suspense fallback={null}>
      <SigninModalBody />
    </Suspense>
  );
}
