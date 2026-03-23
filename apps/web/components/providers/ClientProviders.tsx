'use client';

import { ClerkProvider } from '@clerk/nextjs';
import React from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  ClerkSafeDefaultsProvider,
  ClerkSafeValuesProvider,
} from '@/hooks/useClerkSafe';
import { publicEnv } from '@/lib/env-public';
import type { ThemeMode } from '@/types';
import { CoreProviders } from './CoreProviders';
import { clerkAppearance } from './clerkAppearance';
import { NuqsProvider } from './NuqsProvider';
import { QueryProvider } from './QueryProvider';

interface ClientProvidersProps {
  readonly children: React.ReactNode;
  readonly initialThemeMode?: ThemeMode;
  readonly publishableKey: string | undefined;
  readonly skipCoreProviders?: boolean;
}

function getClerkProxyUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;

  const { hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return undefined;
  }

  return '/clerk';
}

function isMockPublishableKey(publishableKey: string): boolean {
  const lower = publishableKey.toLowerCase();
  return (
    lower.includes('mock') ||
    lower.includes('dummy') ||
    lower.includes('placeholder') ||
    lower.includes('test-key')
  );
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

// Custom domain is configured via CNAME (clerk.jov.ie → frontend-api.clerk.services)
// No proxyUrl needed - Clerk SDK uses the domain from publishable key configuration

// Main export - wraps children with ClerkProvider (client-side only)
// Uses hydration guard to prevent SSR of ClerkProvider which accesses window
export function ClientProviders({
  children,
  initialThemeMode = 'dark',
  publishableKey,
  skipCoreProviders = false,
}: ClientProvidersProps) {
  const shouldBypassClerk =
    !publishableKey ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    isMockPublishableKey(publishableKey);

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
      proxyUrl={getClerkProxyUrl()}
      appearance={clerkAppearance}
      signInUrl={APP_ROUTES.SIGNIN}
      signUpUrl={APP_ROUTES.SIGNUP}
      signInFallbackRedirectUrl={APP_ROUTES.DASHBOARD}
      signUpFallbackRedirectUrl={APP_ROUTES.ONBOARDING}
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
