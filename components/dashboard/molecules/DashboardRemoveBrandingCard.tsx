import Link from 'next/link';

import { cn } from '@/lib/utils';

export interface DashboardRemoveBrandingCardProps {
  className?: string;
}

export function DashboardRemoveBrandingCard({
  className,
}: DashboardRemoveBrandingCardProps) {
  return (
    <Link
      href='/billing/remove-branding'
      className={cn(
        'relative block overflow-hidden rounded-xl border border-sidebar-border/70 bg-sidebar px-4 py-3 group-data-[collapsible=icon]:hidden',
        'transition-colors hover:border-sidebar-accent hover:bg-sidebar/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
        className
      )}
    >
      <div className='pointer-events-none absolute inset-0'>
        <div className='absolute inset-0 bg-linear-to-br from-transparent via-sidebar-accent/5 to-sidebar-accent/15' />
      </div>
      <div className='relative space-y-3'>
        <div className='flex items-start justify-between gap-2'>
          <div className='space-y-1'>
            <h3 className='text-sm font-medium text-sidebar-foreground'>
              Remove Jovie branding
            </h3>
            <p className='text-xs text-sidebar-foreground/80'>
              Keep your Jovie profile clean and fully on-brand for your fans.
            </p>
          </div>
          <span className='inline-flex items-center rounded-full border border-sidebar-border/70 bg-sidebar/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/80'>
            Pro
          </span>
        </div>

        <div className='flex items-center justify-between rounded-lg bg-sidebar-foreground/5 px-3 py-1.5 text-xs font-medium text-sidebar-foreground'>
          <span>Upgrade to remove branding</span>
          <span className='text-xs text-sidebar-foreground/80'>$5/mo</span>
        </div>
      </div>
    </Link>
  );
}
