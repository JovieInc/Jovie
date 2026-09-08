'use client';

import { useEffect, useState } from 'react';
import { hasClientAuthSession } from '@/lib/auth/auth-session-cookies';

/**
 * Lightweight client-side auth detection from Better Auth session cookies.
 *
 * Returns `false` during SSR/SSG and on initial render, then `true` after
 * hydration if the browser has a Better Auth (or leftover Clerk) session
 * cookie. This ensures:
 * - No impact on static generation (always renders unauthenticated state first)
 * - No layout shift (buttons are the same size)
 * - No server-side data fetching required
 */
export function useIsAuthenticated(): boolean {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const syncAuthState = () => {
      setIsAuthed(hasClientAuthSession(document.cookie));
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncAuthState();
      }
    };

    syncAuthState();
    globalThis.addEventListener('focus', syncAuthState);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      globalThis.removeEventListener('focus', syncAuthState);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return isAuthed;
}
