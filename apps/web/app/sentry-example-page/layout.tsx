import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export default function SentryExampleLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}
