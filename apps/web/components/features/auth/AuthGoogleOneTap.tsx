'use client';

import { GoogleOneTap } from '@clerk/nextjs';
import { APP_ROUTES } from '@/constants/routes';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import { env as clientEnv } from '@/lib/env-client';
import { publicEnv } from '@/lib/env-public';

interface SearchParamReader {
  readonly get: (key: string) => string | null;
}

interface AuthGoogleOneTapProps {
  readonly searchParams: SearchParamReader;
}

function isGoogleOneTapDisabled(): boolean {
  return (
    publicEnv.NEXT_PUBLIC_GOOGLE_ONE_TAP_DISABLED === '1' ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    clientEnv.IS_E2E
  );
}

export function AuthGoogleOneTap({ searchParams }: AuthGoogleOneTapProps) {
  if (isGoogleOneTapDisabled()) {
    return null;
  }

  const redirectUrl = sanitizeRedirectUrl(searchParams.get('redirect_url'));

  return (
    <GoogleOneTap
      signInForceRedirectUrl={redirectUrl ?? APP_ROUTES.DASHBOARD}
      signUpForceRedirectUrl={redirectUrl ?? APP_ROUTES.ONBOARDING}
    />
  );
}
