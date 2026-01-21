import { BarChart3 } from 'lucide-react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { cn } from '@/lib/utils';

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

const FallbackIcon = BarChart3;

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
      <dl className='flex h-full flex-col py-1'>
        <div className='flex items-center gap-2'>
          <div
            className={cn(
              'shrink-0 flex h-7 w-7 items-center justify-center rounded-lg',
              iconChipClassName
            )}
            aria-hidden='true'
          >
            <IconToRender
              className={cn('h-4 w-4', iconClassName ?? 'text-accent-token')}
            />
          </div>
          <dt className='text-xs font-medium text-secondary-token'>
            {title}
          </dt>
          {headerRight ? <div className='shrink-0 ml-auto'>{headerRight}</div> : null}
        </div>

        <dd className='mt-2 text-3xl font-semibold tracking-tight text-primary-token tabular-nums leading-none'>
          {value}
        </dd>

        <div className='mt-2'>
          {children ? (
            children
          ) : metadata ? (
            <dd className='text-xs text-tertiary-token'>{metadata}</dd>
          ) : null}
        </div>
      </dl>
    </section>
  );
}
