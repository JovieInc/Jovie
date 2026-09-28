'use client';

import { useEffect } from 'react';
import { SmartLinkLoadingState } from '@/components/features/release/SmartLinkLoadingState';

interface PreserveSearchRedirectProps {
  readonly href: string;
}

/**
 * Redirects client-side so `?dsp=`/UTM query params survive the hop from a
 * track's short URL to its nested release URL, while keeping this route
 * statically prerendered (reading `searchParams` server-side would force
 * per-request dynamic rendering). Renders the shared smart-link loading
 * shell instead of nothing so the pre-redirect paint is never blank.
 */
export function PreserveSearchRedirect({
  href,
}: Readonly<PreserveSearchRedirectProps>) {
  useEffect(() => {
    const nextUrl = new URL(href, globalThis.location.origin);
    nextUrl.search = globalThis.location.search;
    nextUrl.hash = globalThis.location.hash;

    const currentUrl = `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}`;
    const targetUrl = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;

    if (currentUrl === targetUrl) {
      return;
    }

    globalThis.location.replace(nextUrl.toString());
  }, [href]);

  return <SmartLinkLoadingState />;
}
