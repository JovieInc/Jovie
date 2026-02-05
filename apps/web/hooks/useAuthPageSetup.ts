'use client';

import { useEffect } from 'react';
import { AUTH_STORAGE_KEYS, sanitizeRedirectUrl } from '@/lib/auth/constants';

/**
 * Shared setup logic for auth pages (signin/signup).
 * - Strips password-related hash fragments (Jovie is passwordless)
 * - Stores redirect URL from query params in session storage
 */
export function useAuthPageSetup(): void {
  // Handle password-related hash fragments that Clerk may add
  useEffect(() => {
    const hash = globalThis.location.hash;
    const passwordHashFragments = [
      '#reset-password',
      '#/reset-password',
      '#forgot-password',
      '#/forgot-password',
      '#set-password',
      '#/set-password',
    ];

    if (passwordHashFragments.some(fragment => hash.startsWith(fragment))) {
      globalThis.history.replaceState(
        null,
        '',
        globalThis.location.pathname + globalThis.location.search
      );
    }
  }, []);

  // Store redirect URL from query params on mount
  useEffect(() => {
    try {
      const redirectUrl = new URL(globalThis.location.href).searchParams.get(
        'redirect_url'
      );
      const sanitized = sanitizeRedirectUrl(redirectUrl);
      if (sanitized) {
        globalThis.sessionStorage.setItem(
          AUTH_STORAGE_KEYS.REDIRECT_URL,
          sanitized
        );
      }
    } catch {
      // Ignore errors
    }
  }, []);
}
