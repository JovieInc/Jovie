'use client';

import { memo } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { cn } from '@/lib/utils';

interface EarningsStatCardProps {
  readonly label: string;
  readonly value: string;
  readonly description?: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly iconClassName: string;
}

export const EarningsStatCard = memo(function EarningsStatCard({
  label,
  value,
  description,
  icon: Icon,
  iconClassName,
}: EarningsStatCardProps) {
  return (
    <ContentSurfaceCard className='h-full p-2.5'>
      <dl className='flex h-full flex-col'>
        <div className='flex items-center gap-2'>
          <div
            className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface-1'
            aria-hidden='true'
          >
            <Icon className={cn('h-3.5 w-3.5', iconClassName)} />
          </div>
          <dt className='text-[13px] font-[510] text-secondary-token'>
            {label}
          </dt>
        </div>
        <dd className='mt-2 text-[22px] font-[590] tabular-nums leading-none tracking-[-0.011em] text-primary-token sm:text-2xl'>
          {value}
        </dd>
        {description && (
          <dd className='mt-1.5 text-[11px] leading-4 text-tertiary-token'>
            {description}
          </dd>
        )}
      </dl>
    </ContentSurfaceCard>
  );
});
