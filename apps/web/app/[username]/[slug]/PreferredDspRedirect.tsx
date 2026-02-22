'use client';

import { useEffect } from 'react';
import { LISTEN_COOKIE } from '@/constants/app';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ProviderKey } from '@/lib/discography/types';

interface PreferredDspRedirectProps {
  /** Provider links available for this content, used to validate the preference */
  readonly providerLinks: ReadonlyArray<{ providerId: string; url: string }>;
  /** Base path for the DSP redirect (e.g. /artist/release) */
  readonly redirectBasePath: string;
}

/**
 * Client component that reads the user's preferred DSP from the cookie
 * and redirects to that provider if available. This runs on the client
 * to preserve ISR caching on the server page.
 */
export function PreferredDspRedirect({
  providerLinks,
  redirectBasePath,
}: PreferredDspRedirectProps) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const cookieValue = document.cookie
      .split(';')
      .find(cookie => cookie.trim().startsWith(`${LISTEN_COOKIE}=`))
      ?.split('=')[1]
      ?.trim();

    if (!cookieValue) return;

    const providerKey = cookieValue as ProviderKey;

    // Validate the provider exists in our config and is available for this content
    if (!PROVIDER_CONFIG[providerKey]) return;

    const matchingLink = providerLinks.find(
      link => link.providerId === providerKey
    );
    if (!matchingLink?.url) return;

    // Redirect to the DSP via the server-side redirect endpoint
    window.location.replace(
      `${redirectBasePath}?dsp=${encodeURIComponent(providerKey)}`
    );
  }, [providerLinks, redirectBasePath]);

  return null;
}
