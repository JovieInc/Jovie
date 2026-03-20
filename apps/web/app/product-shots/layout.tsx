import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Product Shots — Jovie',
  robots: { index: false, follow: false },
};

export default function ProductShotsLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <div className='min-h-screen bg-[#0a0a0a] text-white'>{children}</div>;
}
