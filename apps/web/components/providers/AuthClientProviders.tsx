'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { ui } from '@clerk/ui';
import type { ReactNode } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  ClerkSafeDefaultsProvider,
  ClerkSafeValuesProvider,
} from '@/hooks/useClerkSafe';
import { publicEnv } from '@/lib/env-public';
import { authClerkAppearance } from './clerkAppearance';
import { getClerkProxyUrl, shouldBypassClerk } from './clerkAvailability';
import { QueryProvider } from './QueryProvider';

interface AuthClientProvidersProps {
  readonly children: ReactNode;
  readonly forceBypassClerk?: boolean;
  readonly forceEnableClerk?: boolean;
  readonly publishableKey: string | undefined;
}

function wrapChildren(children: ReactNode) {
  return <QueryProvider>{children}</QueryProvider>;
}

export function AuthClientProviders({
  children,
  forceBypassClerk = false,
  forceEnableClerk = false,
  publishableKey,
}: AuthClientProvidersProps) {
  const shouldSkipClerk =
    forceBypassClerk ||
    (!forceEnableClerk &&
      shouldBypassClerk(
        publishableKey,
        publicEnv.NEXT_PUBLIC_CLERK_MOCK,
        globalThis.location
      ));

  if (shouldSkipClerk) {
    return (
      <ClerkSafeDefaultsProvider>
        {wrapChildren(children)}
      </ClerkSafeDefaultsProvider>
    );
  }

  // @clerk/ui bundled locally to avoid CDN loading issues with frontendApiProxy.
  // Added to transpilePackages in next.config.js to resolve Turbopack + pnpm symlink issues.
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      proxyUrl={getClerkProxyUrl(globalThis.location)}
      appearance={authClerkAppearance}
      ui={ui}
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
