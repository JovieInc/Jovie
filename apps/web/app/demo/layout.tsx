import type { Metadata } from 'next';
import { type ReactNode, Suspense } from 'react';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export const revalidate = false;

export default function DemoLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
