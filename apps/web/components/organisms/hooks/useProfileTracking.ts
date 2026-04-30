'use client';

import { useEffect, useRef } from 'react';
import { useTrackingMutation } from '@/lib/queries/useTrackingMutation';

export function useTipPageTracking({
  artistHandle,
  mode,
  source,
}: {
  artistHandle?: string;
  mode?: string | null;
  source?: string | null;
}) {
  const trackTip = useTrackingMutation({
    endpoint: '/api/track',
  });
  const trackTipRef = useRef(trackTip);
  useEffect(() => {
    trackTipRef.current = trackTip;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!artistHandle) return;
    if (mode !== 'pay') return;

    trackTipRef.current.mutate({
      handle: artistHandle,
      linkType: 'tip',
      target: 'tip_page',
      source,
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
  const params = new URLSearchParams(globalThis.location.search);
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

export function useProfileVisitTracking(
  artistId?: string,
  trackingToken?: string
) {
  const trackVisit = useTrackingMutation({
    endpoint: '/api/audience/visit',
  });
  const trackVisitRef = useRef(trackVisit);
  useEffect(() => {
    trackVisitRef.current = trackVisit;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!artistId) return;
    if (process.env.NEXT_PUBLIC_CI === 'true') return;
    let cancelled = false;
    const profileId = artistId;

    const utmParams = extractUtmParams();
    const referrer = document.referrer || undefined;

    async function recordVisit() {
      let resolvedToken = trackingToken;
      if (!resolvedToken) {
        try {
          const response = await fetch(
            `/api/audience/visit-token?profileId=${encodeURIComponent(profileId)}`,
            { cache: 'no-store' }
          );
          const payload = (await response.json().catch(() => null)) as {
            token?: string | null;
          } | null;
          resolvedToken = payload?.token ?? undefined;
        } catch {
          resolvedToken = undefined;
        }
      }

      if (cancelled) return;
      trackVisitRef.current.mutate({
        profileId: artistId,
        referrer,
        ...(utmParams && { utmParams }),
        ...(resolvedToken && { trackingToken: resolvedToken }),
      });
    }

    void recordVisit();
    return () => {
      cancelled = true;
    };
  }, [artistId, trackingToken]);
}

export function usePopstateReset(callback: () => void) {
  useEffect(() => {
    const handlePopState = () => callback();
    globalThis.addEventListener('popstate', handlePopState);
    return () => globalThis.removeEventListener('popstate', handlePopState);
  }, [callback]);
}
