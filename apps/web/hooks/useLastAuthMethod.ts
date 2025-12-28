'use client';

import { useClerk } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import type { AuthMethod } from '@/lib/auth/types';

// Re-export type for backwards compatibility
export type { AuthMethod } from '@/lib/auth/types';

const LAST_AUTH_METHOD_STORAGE_KEY = 'jovie.last_auth_method';

interface ClerkClientLastAuthStrategyAccess {
  client?: {
    lastAuthenticationStrategy?: string | null;
  };
}

function isAuthMethod(value: string | null): value is AuthMethod {
  return value === 'email' || value === 'google' || value === 'spotify';
}

function authMethodFromClerkLastStrategy(
  lastStrategy: string | null | undefined
): AuthMethod | null {
  if (!lastStrategy) return null;
  if (lastStrategy === 'oauth_spotify') return 'spotify';
  if (lastStrategy === 'oauth_google') return 'google';
  if (lastStrategy.startsWith('oauth_')) return null;
  if (lastStrategy.includes('email')) return 'email';
  if (lastStrategy.includes('google')) return 'google';
  return null;
}

/**
 * Hook to get and set the last used authentication method.
 * Checks Clerk's lastAuthenticationStrategy first, then falls back to localStorage.
 */
export function useLastAuthMethod(): [
  AuthMethod | null,
  (method: AuthMethod) => void,
] {
  const clerk = useClerk();
  const [lastAuthMethod, setLastAuthMethod] = useState<AuthMethod | null>(null);

  useEffect(() => {
    // Try Clerk's internal tracking first
    const lastStrategy = (clerk as unknown as ClerkClientLastAuthStrategyAccess)
      .client?.lastAuthenticationStrategy;

    const fromClerk = authMethodFromClerkLastStrategy(lastStrategy);
    if (fromClerk) {
      setLastAuthMethod(fromClerk);
      return;
    }

    // Fall back to localStorage
    try {
      const stored = window.localStorage.getItem(LAST_AUTH_METHOD_STORAGE_KEY);
      if (isAuthMethod(stored)) {
        setLastAuthMethod(stored);
      }
    } catch {
      // Ignore localStorage access errors
    }
  }, [clerk]);

  const persistMethod = (method: AuthMethod) => {
    setLastAuthMethod(method);
    try {
      window.localStorage.setItem(LAST_AUTH_METHOD_STORAGE_KEY, method);
    } catch {
      // Ignore localStorage errors
    }
  };

  return [lastAuthMethod, persistMethod];
}
