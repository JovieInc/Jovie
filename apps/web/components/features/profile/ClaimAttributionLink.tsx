'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { useLocationSearch } from '@/hooks/useLocationSearch';
import { claimHrefWithAttribution } from '@/lib/claim/attribution';

/** Preserves bounded campaign labels across a static public profile's claim CTAs. */
export function ClaimAttributionLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, 'href'> & { readonly href: string }) {
  const search = useLocationSearch();
  return (
    <Link
      {...props}
      href={claimHrefWithAttribution(href, new URLSearchParams(search ?? ''))}
    />
  );
}
