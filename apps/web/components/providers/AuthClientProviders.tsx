'use client';

import { ClerkProvider } from '@clerk/nextjs';
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
  const [isClerkReady, setIsClerkReady] = useState(false);
  const shouldSkipClerk = shouldBypassClerk(
    publishableKey,
    publicEnv.NEXT_PUBLIC_CLERK_MOCK
  );

  useEffect(() => {
    setIsClerkReady(true);
  }, []);

  if (shouldSkipClerk) {
    return (
      <ClerkSafeDefaultsProvider>
        {wrapChildren(children)}
      </ClerkSafeDefaultsProvider>
    );
  }

  if (!isClerkReady) {
    return null;
  }

  // Note: ui prop omitted — @clerk/ui has ESM + react-server export conditions
  // that Turbopack can't resolve through pnpm symlinks. Without the ui prop,
  // Clerk loads its UI components from the Clerk CDN instead of bundling them.
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
