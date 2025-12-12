import { ChartBarIcon } from '@heroicons/react/24/outline';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { cn } from '@/lib/utils';
import { cardTokens } from '../tokens/card-tokens';

interface AnalyticsCardProps {
  title: string;
  value: number | string;
  metadata?: string;
  order?: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  iconClassName?: string;
  iconChipClassName?: string;
  headerRight?: ReactNode;
  children?: ReactNode;
}

const FallbackIcon = ChartBarIcon;

export function AnalyticsCard({
  title,
  value,
  metadata,
  order,
  icon: IconComponent,
  iconClassName,
  iconChipClassName,
  headerRight,
  children,
}: AnalyticsCardProps) {
  const IconToRender = IconComponent ?? FallbackIcon;

  return (
    <div className={cn('h-full', order)}>
      <div
        className={cn(
          cardTokens.variants.analytics,
          cardTokens.interactive.focus,
          'flex h-full flex-col'
        )}
      >
        <div className='flex items-start justify-between gap-3'>
          <p className='text-xs font-semibold uppercase tracking-[0.18em] text-tertiary-token'>
            {title}
          </p>
          {headerRight ? <div className='shrink-0'>{headerRight}</div> : null}
        </div>

        <div className='mt-3 flex items-end justify-between gap-4'>
          <p className='text-4xl font-semibold tracking-tight text-primary-token tabular-nums leading-none dark:text-primary-token/90'>
            {value}
          </p>
          <div
            className={cn(
              'shrink-0 rounded-full border border-subtle bg-surface-2/50 p-2.5 ring-1 ring-inset ring-white/5 dark:ring-white/10',
              iconChipClassName
            )}
            aria-hidden='true'
          >
            <IconToRender
              className={cn('h-5 w-5', iconClassName ?? 'text-accent-token')}
            />
          </div>
        </div>

        <div
          className='mt-4 h-px w-full bg-white/5 dark:bg-white/10'
          aria-hidden='true'
        />

        <div className='mt-auto pt-3'>
          {children ? (
            children
          ) : metadata ? (
            <p className='text-xs text-tertiary-token'>{metadata}</p>
          ) : (
            <div className='h-4' aria-hidden='true' />
          )}
        </div>
      </div>
    </div>
  );
}
