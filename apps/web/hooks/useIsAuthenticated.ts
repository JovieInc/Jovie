'use client';

import { useEffect, useState } from 'react';

/**
 * Lightweight client-side auth detection using Clerk's `__client_uat` cookie.
 *
 * Returns `false` during SSR/SSG and on initial render, then `true` after
 * hydration if the user has an active Clerk session. This ensures:
 * - No impact on static generation (always renders unauthenticated state first)
 * - No layout shift (buttons are the same size)
 * - No server-side data fetching required
 */
export function useIsAuthenticated(): boolean {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const syncAuthState = () => {
      const cookies = document.cookie.split(';');
      const clientUat = cookies.find(c => c.trim().startsWith('__client_uat='));
      const value = clientUat?.slice(clientUat.indexOf('=') + 1)?.trim();
      setIsAuthed(Boolean(value && value !== '0'));
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
