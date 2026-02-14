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

/**
 * Extract UTM campaign parameters from the current page URL.
 * Returns undefined if no UTM params are present.
 */
function extractUtmParams():
  | {
      source?: string;
      medium?: string;
      campaign?: string;
      content?: string;
      term?: string;
    }
  | undefined {
  const params = new URLSearchParams(window.location.search);
  const source = params.get('utm_source');
  const medium = params.get('utm_medium');
  const campaign = params.get('utm_campaign');
  const content = params.get('utm_content');
  const term = params.get('utm_term');

  if (!source && !medium && !campaign && !content && !term) return undefined;

  const utm: Record<string, string> = {};
  if (source) utm.source = source;
  if (medium) utm.medium = medium;
  if (campaign) utm.campaign = campaign;
  if (content) utm.content = content;
  if (term) utm.term = term;
  return utm;
}

export function useProfileVisitTracking(artistId?: string) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!artistId) return;

    const utmParams = extractUtmParams();

    fetch('/api/audience/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: artistId,
        ...(utmParams && { utmParams }),
      }),
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
