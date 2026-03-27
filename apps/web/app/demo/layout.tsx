import type { Metadata } from 'next';
import { type ReactNode, Suspense } from 'react';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export const revalidate = false;

export default function DemoLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
