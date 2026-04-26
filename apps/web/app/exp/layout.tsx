import { TooltipProvider } from '@jovie/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export default function ExpLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={400}>
      <div className='h-dvh w-dvw bg-(--linear-bg-page) text-primary-token'>
        {children}
      </div>
    </TooltipProvider>
  );
}
