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

          <div className='mt-4 flex items-end justify-between gap-4'>
            <dd className='text-[2.4rem] font-semibold tracking-tight text-primary-token tabular-nums leading-none dark:text-primary-token/90'>
              {value}
            </dd>
            <div
              className={cn(
                'shrink-0 rounded-full border border-subtle/80 bg-surface-2/70 p-2.5 ring-1 ring-inset ring-white/10 shadow-sm shadow-black/5 dark:shadow-black/30',
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
