import { ChevronRightIcon } from '@heroicons/react/24/outline';
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
        'group relative block overflow-hidden rounded-xl border border-subtle/40 bg-surface-1/85 px-4 py-4 text-primary-token shadow-sm backdrop-blur-sm',
        'transition-all duration-180 ease-out hover:-translate-y-0.25 hover:bg-surface-2/85 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',
        'group-data-[collapsible=icon]:hidden',
        className
      )}
    >
      <div className='space-y-2'>
        {/* Hero row: benefit + price pill */}
        <div className='flex items-center justify-between gap-2'>
          <h3 className='text-sm font-semibold tracking-tight text-primary-token'>
            Remove Jovie branding
          </h3>
          <span className='inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-secondary-token'>
            $5/mo
          </span>
        </div>

        {/* Meta row: subtle upgrade labels + chevron */}
        <div className='flex items-center justify-between gap-2 text-[11px] text-tertiary-token'>
          <div className='flex items-center gap-2'>
            <span className='uppercase tracking-wide'>Upgrade</span>
            <span className='inline-flex items-center rounded-full border border-subtle bg-surface-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-token'>
              Pro
            </span>
          </div>
          <div className='flex items-center gap-1 text-secondary-token'>
            <span>Details</span>
            <ChevronRightIcon className='h-3.5 w-3.5' aria-hidden='true' />
          </div>
        </div>
      </div>
    </Link>
  );
}
