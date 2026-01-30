'use client';

import { useEffect } from 'react';

export function useTipPageTracking({
  artistHandle,
  mode,
  source,
}: {
  artistHandle?: string;
  mode?: string | null;
  source?: string | null;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!artistHandle) return;
    if (mode !== 'tip') return;

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle: artistHandle,
        linkType: 'tip',
        target: 'tip_page',
        source,
      }),
      keepalive: true,
    }).catch(() => {
      // Ignore tracking errors
    });
  }, [artistHandle, mode, source]);
}

export function useProfileVisitTracking(artistId?: string) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!artistId) return;

    fetch('/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: artistId }),
      keepalive: true,
    }).catch(() => {
      // Ignore tracking errors
    });
  }, [artistId]);
}

export function usePopstateReset(callback: () => void) {
  useEffect(() => {
    const handlePopState = () => callback();
    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [callback]);
}
