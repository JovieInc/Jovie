'use client';

import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  ClerkSafeDefaultsProvider,
  ClerkSafeValuesProvider,
} from '@/hooks/useClerkSafe';
import { publicEnv } from '@/lib/env-public';
import { authClerkAppearance } from './clerkAppearance';
import { getClerkProxyUrl, shouldBypassClerk } from './clerkAvailability';
import { NuqsProvider } from './NuqsProvider';
import { QueryProvider } from './QueryProvider';

interface AuthClientProvidersProps {
  readonly children: ReactNode;
  readonly publishableKey: string | undefined;
}

function wrapChildren(children: ReactNode) {
  return (
    <NuqsProvider>
      <QueryProvider>{children}</QueryProvider>
    </NuqsProvider>
  );
}

export function AuthClientProviders({
  children,
  publishableKey,
}: AuthClientProvidersProps) {
  const shouldSkipClerk = shouldBypassClerk(
    publishableKey,
    publicEnv.NEXT_PUBLIC_CLERK_MOCK
  );

  if (shouldSkipClerk) {
    return (
      <ClerkSafeDefaultsProvider>
        {wrapChildren(children)}
      </ClerkSafeDefaultsProvider>
    );
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      proxyUrl={getClerkProxyUrl()}
      appearance={authClerkAppearance}
      signInUrl={APP_ROUTES.SIGNIN}
      signUpUrl={APP_ROUTES.SIGNUP}
      signInFallbackRedirectUrl={APP_ROUTES.DASHBOARD}
      signUpFallbackRedirectUrl={APP_ROUTES.WAITLIST}
    >
      <ClerkSafeValuesProvider>
        {wrapChildren(children)}
      </ClerkSafeValuesProvider>
    </ClerkProvider>
  );
}
