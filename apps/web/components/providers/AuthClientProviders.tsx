'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { ui } from '@clerk/ui';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
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
  const [proxyUrl, setProxyUrl] = useState<string | undefined>(undefined);
  const shouldSkipClerk = shouldBypassClerk(
    publishableKey,
    publicEnv.NEXT_PUBLIC_CLERK_MOCK
  );

  useEffect(() => {
    // Clerk's SSR path can touch window when proxyUrl is provided eagerly.
    // Defer proxy configuration until mount so the page shell still renders.
    setProxyUrl(getClerkProxyUrl());
  }, []);

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
      proxyUrl={proxyUrl}
      ui={ui}
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
