'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { ClerkSafeDefaultsProvider } from '@/hooks/useClerkSafe';
import { shouldBypassClerkProvider } from './clerkProviderConfig';

interface AuthClientProvidersProps {
  readonly children: React.ReactNode;
  readonly publishableKey: string | undefined;
}

const AuthClerkProvider = dynamic(
  () => import('./AuthClerkProvider').then(mod => mod.AuthClerkProvider),
  {
    loading: () => null,
  }
);

/**
 * Lightweight Clerk-only provider tree for auth routes.
 */
export function AuthClientProviders({
  children,
  publishableKey,
}: AuthClientProvidersProps) {
  const resolvedPublishableKey = publishableKey;

  if (
    shouldBypassClerkProvider(resolvedPublishableKey) ||
    !resolvedPublishableKey
  ) {
    return <ClerkSafeDefaultsProvider>{children}</ClerkSafeDefaultsProvider>;
  }

  return (
    <AuthClerkProvider publishableKey={resolvedPublishableKey}>
      {children}
    </AuthClerkProvider>
  );
}
