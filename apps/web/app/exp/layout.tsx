import { TooltipProvider } from '@jovie/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { NOINDEX_ROBOTS } from '@/lib/seo/noindex-metadata';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

// /exp/* routes share the production QueryClient + Tooltip context so
// shipped components (Variant F ChatInput, etc.) work as-is when we
// drop them into the design pass.
export default function ExpLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <QueryProvider>
      <TooltipProvider delayDuration={400}>
        <div className='h-dvh w-dvw bg-(--linear-bg-page) text-primary-token'>
          {children}
        </div>
      </TooltipProvider>
    </QueryProvider>
  );
}
