'use client';

import { useEffect } from 'react';
import { LISTEN_COOKIE } from '@/constants/app';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ProviderKey } from '@/lib/discography/types';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import { appendUTMParamsToUrl, extractUTMParams } from '@/lib/utm';

interface PreferredDspRedirectProps {
  /** Provider links available for this content, used to validate the preference */
  readonly providerLinks: ReadonlyArray<{ providerId: string; url: string }>;
  /** Artist handle for analytics tracking */
  readonly artistHandle: string | null;
  /** Tracking context for analytics */
  readonly tracking?: {
    readonly contentType: 'release' | 'track';
    readonly contentId: string;
    readonly smartLinkSlug?: string | null;
  };
}

/**
 * Client component that reads the user's preferred DSP from the cookie
 * and redirects to that provider if available. This runs on the client
 * to preserve ISR caching on the server page.
 */
export function PreferredDspRedirect({
  providerLinks,
  artistHandle,
  tracking,
}: PreferredDspRedirectProps) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const searchParams = new URLSearchParams(globalThis.location.search);
    const explicitProvider = searchParams.get('dsp');
    const shouldSkipPreferredRedirect = searchParams.get('noredirect') === '1';

    const cookieValue = document.cookie
      .split(';')
      .find(cookie => cookie.trim().startsWith(`${LISTEN_COOKIE}=`))
      ?.split('=')[1]
      ?.trim();

    const providerKey = (
      explicitProvider ?? (shouldSkipPreferredRedirect ? null : cookieValue)
    ) as ProviderKey | null;
    if (!providerKey) return;

    // Validate the provider exists in our config and is available for this content
    if (!PROVIDER_CONFIG[providerKey]) return;

    const matchingLink = providerLinks.find(
      link => link.providerId === providerKey
    );
    if (!matchingLink?.url) return;

    if (artistHandle && tracking?.contentId && tracking?.contentType) {
      postJsonBeacon(
        '/api/track',
        {
          handle: artistHandle,
          linkType: 'listen',
          target: providerKey,
          source: explicitProvider ? 'redirect' : 'preferred_dsp',
          context: {
            contentType: tracking.contentType,
            contentId: tracking.contentId,
            provider: providerKey,
            smartLinkSlug: tracking.smartLinkSlug ?? undefined,
          },
        },
        () => {}
      );
    }

    globalThis.location.replace(
      appendUTMParamsToUrl(matchingLink.url, extractUTMParams(searchParams))
    );
  }, [artistHandle, providerLinks, tracking]);

  return null;
}
