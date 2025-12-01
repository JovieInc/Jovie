import { Button } from '@jovie/ui';
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
        'relative overflow-hidden rounded-lg border border-subtle bg-surface-1/90 px-3 py-3 text-primary-token shadow-sm group-data-[collapsible=icon]:hidden',
        className
      )}
    >
      <div className='relative space-y-2'>
        <div className='space-y-1'>
          <p className='text-xs font-semibold uppercase tracking-wide text-tertiary-token'>
            Pro
          </p>
          <h3 className='text-sm font-semibold leading-tight text-primary-token'>
            Remove Jovie branding
          </h3>
          <p className='text-xs text-secondary-token'>
            Keep your profile clean and on-brand.
          </p>
        </div>

        <Button
          asChild
          size='sm'
          variant='secondary'
          className='w-full justify-center'
        >
          <Link href='/billing/remove-branding'>Upgrade to Pro</Link>
        </Button>
      </div>
    </div>
  );
}
