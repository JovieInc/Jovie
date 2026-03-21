'use client';

import { ClerkProvider } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import { ClerkSafeValuesProvider } from './ClerkSafeValuesProvider';
import { clerkProviderProps } from './clerkProviderConfig';

interface AuthClerkProviderProps {
  readonly children: ReactNode;
  readonly publishableKey: string;
}

export function AuthClerkProvider({
  children,
  publishableKey,
}: AuthClerkProviderProps) {
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
      <ClerkSafeValuesProvider>{children}</ClerkSafeValuesProvider>
    </ClerkProvider>
  );
}
