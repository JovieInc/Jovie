import Link from 'next/link';

import { cn } from '@/lib/utils';

export interface DashboardRemoveBrandingCardProps {
  className?: string;
}

export function DashboardRemoveBrandingCard({
  className,
}: DashboardRemoveBrandingCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-sidebar-border bg-sidebar px-3 py-3 group-data-[collapsible=icon]:hidden',
        className
      )}
    >
      <div className='pointer-events-none absolute inset-0'>
        <div className='absolute inset-0 bg-linear-to-br from-transparent via-sidebar-accent/5 to-sidebar-accent/10' />
      </div>

      <div className='relative space-y-2'>
        <div className='space-y-1'>
          <h3 className='text-sm font-medium text-sidebar-foreground'>
            Remove Jovie branding
          </h3>
          <p className='text-xs text-sidebar-foreground/80'>
            Keep your Jovie profile clean and fully on-brand for your fans.
          </p>
        </div>

        <Link
          href='/pricing'
          className='inline-flex w-full items-center justify-center rounded-full bg-sidebar-foreground px-3 py-1.5 text-xs font-semibold text-sidebar shadow-sm transition-colors hover:bg-sidebar-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar'
        >
          Remove branding  $5/mo
        </Link>
      </div>
    </div>
  );
}
