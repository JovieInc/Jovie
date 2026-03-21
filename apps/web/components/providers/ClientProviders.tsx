'use client';

import { ClerkProvider } from '@clerk/nextjs';
import React from 'react';
import { ClerkSafeDefaultsProvider } from '@/hooks/useClerkSafe';
import type { ThemeMode } from '@/types';
import { ClerkSafeValuesProvider } from './ClerkSafeValuesProvider';
import { CoreProviders } from './CoreProviders';
import {
  clerkProviderProps,
  shouldBypassClerkProvider,
} from './clerkProviderConfig';
import { NuqsProvider } from './NuqsProvider';
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
    <NuqsProvider>
      <QueryProvider>{children}</QueryProvider>
    </NuqsProvider>
  ) : (
    <CoreProviders initialThemeMode={initialThemeMode}>
      {children}
    </CoreProviders>
  );

  return content;
}

// Main export - wraps children with ClerkProvider (client-side only)
// Uses hydration guard to prevent SSR of ClerkProvider which accesses window
export function ClientProviders({
  children,
  initialThemeMode = 'dark',
  publishableKey,
  skipCoreProviders = false,
}: ClientProvidersProps) {
  const shouldBypassClerk = shouldBypassClerkProvider(publishableKey);

  if (shouldBypassClerk) {
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
      proxyUrl={clerkProviderProps.proxyUrl()}
      appearance={clerkProviderProps.appearance}
      signInUrl={clerkProviderProps.signInUrl}
      signUpUrl={clerkProviderProps.signUpUrl}
      signInFallbackRedirectUrl={clerkProviderProps.signInFallbackRedirectUrl}
      signUpFallbackRedirectUrl={clerkProviderProps.signUpFallbackRedirectUrl}
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
