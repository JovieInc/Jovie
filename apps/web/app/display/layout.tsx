import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  title: 'Display',
  robots: NOINDEX_ROBOTS,
};

/** Outside /app/*: no Clerk shell, so an expired login can never block the display. */
export default function DisplayLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <QueryProvider>{children}</QueryProvider>;
}
