import { ChartBarIcon } from '@heroicons/react/24/outline';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { cn } from '@/lib/utils';
import { cardTokens } from '../tokens/card-tokens';

interface AnalyticsCardProps {
  title: string;
  value: number | string;
  metadata?: ReactNode;
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
    <section className={cn('h-full', order)} aria-label={`${title} metric`}>
      <div
        className={cn(
          cardTokens.variants.analytics,
          cardTokens.interactive.focus,
          'flex h-full flex-col'
        )}
      >
        <dl className='flex h-full flex-col'>
          <div className='flex items-start justify-between gap-3'>
            <dt className='text-xs font-semibold uppercase tracking-[0.18em] text-tertiary-token'>
              {title}
            </dt>
            {headerRight ? <div className='shrink-0'>{headerRight}</div> : null}
          </div>

          <div className='mt-3 flex items-end justify-between gap-4'>
            <dd className='text-[2.25rem] font-semibold tracking-tight text-primary-token tabular-nums leading-none'>
              {value}
            </dd>
            <div
              className={cn(
                'shrink-0 flex h-10 w-10 items-center justify-center rounded-full',
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
            className='mt-4 h-px w-full bg-border-subtle'
            aria-hidden='true'
          />

          <div className='mt-auto pt-3'>
            {children ? (
              children
            ) : metadata ? (
              <dd className='text-xs text-tertiary-token'>{metadata}</dd>
            ) : (
              <div className='h-4' aria-hidden='true' />
            )}
          </div>
        </dl>
      </div>
    </section>
  );
}
