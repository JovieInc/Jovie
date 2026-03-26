'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { ui } from '@clerk/ui';
import React from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  ClerkSafeDefaultsProvider,
  ClerkSafeValuesProvider,
} from '@/hooks/useClerkSafe';
import { publicEnv } from '@/lib/env-public';
import type { ThemeMode } from '@/types';
import { CoreProviders } from './CoreProviders';
import { clerkAppearanceBase } from './clerkAppearance';
import { getClerkProxyUrl, shouldBypassClerk } from './clerkAvailability';
import { QueryProvider } from './QueryProvider';

interface ClientProvidersProps {
  readonly children: React.ReactNode;
  readonly initialThemeMode?: ThemeMode;
  readonly publishableKey: string | undefined;
  readonly skipCoreProviders?: boolean;
}

// Inner component that uses Clerk hooks (must be inside ClerkProvider)
interface WrappedProvidersOptions {
  children: React.ReactNode;
  initialThemeMode: ThemeMode;
  skipCoreProviders: boolean;
}

function wrapWithCoreProviders({
  children,
  initialThemeMode,
  skipCoreProviders,
}: WrappedProvidersOptions) {
  const content = skipCoreProviders ? (
    <QueryProvider>{children}</QueryProvider>
  ) : (
    <CoreProviders initialThemeMode={initialThemeMode}>
      {children}
    </CoreProviders>
  );

  return content;
}
// Main export - wraps children with ClerkProvider
export function ClientProviders({
  children,
  initialThemeMode = 'dark',
  publishableKey,
  skipCoreProviders = false,
}: ClientProvidersProps) {
  const shouldSkipClerk = shouldBypassClerk(
    publishableKey,
    publicEnv.NEXT_PUBLIC_CLERK_MOCK
  );

  if (shouldSkipClerk) {
    // When Clerk is bypassed, wrap with ClerkSafeDefaultsProvider
    // so that safe hooks (useUserSafe, useAuthSafe, etc.) return defaults
    // instead of throwing "must be used within ClerkProvider" errors
    return (
      <ClerkSafeDefaultsProvider>
        {wrapWithCoreProviders({
          children,
          initialThemeMode,
          skipCoreProviders,
        })}
      </ClerkSafeDefaultsProvider>
    );
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      proxyUrl={getClerkProxyUrl()}
      appearance={clerkAppearanceBase}
      ui={ui}
      signInUrl={APP_ROUTES.SIGNIN}
      signUpUrl={APP_ROUTES.SIGNUP}
      signInFallbackRedirectUrl={APP_ROUTES.DASHBOARD}
      signUpFallbackRedirectUrl={APP_ROUTES.WAITLIST}
    >
      <ClerkSafeValuesProvider>
        {wrapWithCoreProviders({
          children,
          initialThemeMode,
          skipCoreProviders,
        })}
      </ClerkSafeValuesProvider>
    </ClerkProvider>
  );
}
