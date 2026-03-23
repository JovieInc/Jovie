'use client';

import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import {
  ClerkSafeDefaultsProvider,
  ClerkSafeValuesProvider,
} from '@/hooks/useClerkSafe';
import { publicEnv } from '@/lib/env-public';
import { clerkAppearance } from './clerkAppearance';
import { NuqsProvider } from './NuqsProvider';
import { QueryProvider } from './QueryProvider';

interface AuthClientProvidersProps {
  readonly children: ReactNode;
  readonly publishableKey: string | undefined;
}

function getClerkProxyUrl(): string | undefined {
  const browserWindow = globalThis.window;
  if (!browserWindow) return undefined;

  const { hostname } = browserWindow.location;
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

function wrapChildren(children: ReactNode) {
  return (
    <NuqsProvider>
      <QueryProvider>{children}</QueryProvider>
    </NuqsProvider>
  );
}

function AuthClerkUnavailableFallback() {
  return (
    <main
      id='main-content'
      data-testid='auth-clerk-unavailable'
      className='mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center'
    >
      <div className='rounded-2xl border border-subtle bg-surface-0 px-6 py-8 shadow-sm'>
        <h1 className='text-xl font-semibold text-primary-token'>
          Authentication is unavailable right now
        </h1>
        <p className='mt-3 text-sm text-secondary-token'>
          Clerk is not configured for this environment yet. Add a real
          publishable key or disable auth-page access until configuration is
          complete.
        </p>
      </div>
    </main>
  );
}

export function AuthClientProviders({
  children,
  publishableKey,
}: AuthClientProvidersProps) {
  const shouldBypassClerk =
    !publishableKey ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    isMockPublishableKey(publishableKey);

  if (shouldBypassClerk) {
    return (
      <ClerkSafeDefaultsProvider>
        {wrapChildren(<AuthClerkUnavailableFallback />)}
      </ClerkSafeDefaultsProvider>
    );
  }

  return (
    <ClerkProvider
      appearance={clerkAppearance}
      publishableKey={publishableKey}
      proxyUrl={getClerkProxyUrl()}
      signInUrl={APP_ROUTES.SIGNIN}
      signUpUrl={APP_ROUTES.SIGNUP}
      signInFallbackRedirectUrl={APP_ROUTES.DASHBOARD}
      signUpFallbackRedirectUrl={APP_ROUTES.ONBOARDING}
    >
      <ClerkSafeValuesProvider>
        {wrapChildren(children)}
      </ClerkSafeValuesProvider>
    </ClerkProvider>
  );
}
