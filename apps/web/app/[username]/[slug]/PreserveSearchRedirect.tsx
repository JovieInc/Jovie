'use client';

import { useEffect } from 'react';

interface PreserveSearchRedirectProps {
  readonly href: string;
}

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

  return null;
}
