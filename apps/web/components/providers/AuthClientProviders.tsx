'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { ui } from '@clerk/ui';
import * as Sentry from '@sentry/nextjs';
import { type ReactNode, useEffect } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  ClerkSafeDefaultsProvider,
  ClerkSafeValuesProvider,
} from '@/hooks/useClerkSafe';
import { publicEnv } from '@/lib/env-public';
import { authClerkAppearance } from './clerkAppearance';
import {
  getClerkProxyUrl,
  isPublicAuthHost,
  shouldBypassClerk,
} from './clerkAvailability';
import { QueryProvider } from './QueryProvider';

interface AuthClientProvidersProps {
  readonly children: ReactNode;
  readonly forceEnableClerk?: boolean;
  readonly publishableKey: string | undefined;
}

function wrapChildren(children: ReactNode) {
  return <QueryProvider>{children}</QueryProvider>;
}

export function AuthClientProviders({
  children,
  forceEnableClerk = false,
  publishableKey,
}: AuthClientProvidersProps) {
  const shouldSkipClerk =
    !forceEnableClerk &&
    shouldBypassClerk(
      publishableKey,
      publicEnv.NEXT_PUBLIC_CLERK_MOCK,
      globalThis.location
    );

  const bypassOnPublicHost =
    shouldSkipClerk && isPublicAuthHost(globalThis.location);

  useEffect(() => {
    if (!bypassOnPublicHost) return;
    Sentry.captureMessage('clerk_bypass_on_public_host', {
      level: 'error',
      tags: {
        hostname: globalThis.location?.hostname ?? 'unknown',
        has_runtime_pk: publishableKey ? '1' : '0',
      },
    });
  }, [bypassOnPublicHost, publishableKey]);

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
