import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

export interface DashboardRemoveBrandingCardProps {
  readonly className?: string;
}

export function DashboardRemoveBrandingCard({
  className,
}: DashboardRemoveBrandingCardProps) {
  return (
    <Link
      href='/billing/remove-branding'
      className={cn(
        'group relative block overflow-hidden rounded-xl border border-sidebar-border bg-sidebar-surface px-3 py-3 text-primary-token',
        'transition-colors duration-150 ease-out hover:bg-sidebar-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
    >
      <div className='space-y-2'>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-center gap-2'>
            <span className='inline-flex items-center rounded-md border border-sidebar-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-muted'>
              Pro
            </span>
            <span className='text-[10px] font-medium text-sidebar-muted'>
              From $39/mo
            </span>
          </div>

          <div className='sm:shrink-0'>
            <div className='inline-flex w-full items-center justify-center gap-1 rounded-md bg-sidebar-accent px-2 py-1 text-[11px] font-semibold text-sidebar-accent-foreground sm:w-auto'>
              <span>Upgrade</span>
              <ChevronRight className='h-3.5 w-3.5' aria-hidden='true' />
            </div>
          </div>
        </div>

        <div className='space-y-0.5'>
          <h3 className='text-[13px] font-semibold leading-5 text-sidebar-foreground'>
            Remove Jovie branding
          </h3>
          <p className='line-clamp-2 text-[12px] leading-5 text-sidebar-muted'>
            Give your fans a cleaner, fully custom experience.
          </p>
        </div>
      </div>
    </Link>
  );
}
