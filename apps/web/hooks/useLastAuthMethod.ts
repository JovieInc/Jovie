'use client';

import { useEffect, useState } from 'react';
import type { AuthMethod } from '@/lib/auth/types';

// Re-export type for backwards compatibility
export type { AuthMethod } from '@/lib/auth/types';

const LAST_AUTH_METHOD_STORAGE_KEY = 'jovie.last_auth_method';

function isAuthMethod(value: string | null): value is AuthMethod {
  return value === 'email' || value === 'google';
}

/**
 * Hook to get and set the last used authentication method.
 * Stored locally so this hook can run on auth and dashboard surfaces even when
 * Clerk is intentionally bypassed in local/test contexts.
 */
export function useLastAuthMethod(): [
  AuthMethod | null,
  (method: AuthMethod) => void,
] {
  const [lastAuthMethod, setLastAuthMethod] = useState<AuthMethod | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LAST_AUTH_METHOD_STORAGE_KEY);
      if (isAuthMethod(stored)) {
        setLastAuthMethod(stored);
      }
    } catch {
      // Ignore localStorage access errors
    }
  }, []);

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
