import { BarChart3 } from 'lucide-react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { cn } from '@/lib/utils';

export type AnalyticsCardVariant = 'card' | 'hero';

interface AnalyticsCardProps {
  readonly title: string;
  readonly value: number | string;
  readonly metadata?: ReactNode;
  readonly order?: string;
  readonly icon?: ComponentType<SVGProps<SVGSVGElement>>;
  readonly iconClassName?: string;
  /** Accepted for call-site compatibility; not currently rendered. */
  readonly iconChipClassName?: string;
  readonly headerRight?: ReactNode;
  readonly children?: ReactNode;
  /**
   * Visual treatment.
   * - `card` (default): wrapped `ContentMetricCard` — for compact KPI grids.
   * - `hero`: flat `<section>` (no card wrapper), 36px bold number — for
   *   page-leading "default alive" metrics like MRR, ARR, or paying customers.
   */
  readonly variant?: AnalyticsCardVariant;
  readonly ariaLabel?: string;
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
  variant = 'card',
  ariaLabel,
}: AnalyticsCardProps) {
  if (variant === 'hero') {
    const subtitle = children ?? metadata;
    return (
      <section className={order} aria-label={ariaLabel ?? `${title} metric`}>
        <p className='text-[36px] font-bold leading-none tracking-[-0.03em] text-primary-token tabular-nums'>
          {value}
        </p>
        <p className='mt-1.5 text-app font-book text-tertiary-token'>{title}</p>
        {subtitle ? (
          <div className='mt-0.5 text-app font-book text-tertiary-token'>
            {subtitle}
          </div>
        ) : null}
      </section>
    );
  }

  const IconToRender = IconComponent ?? FallbackIcon;

  return (
    <ContentMetricCard
      as='section'
      className={order}
      label={title}
      value={value}
      subtitle={children ?? metadata}
      icon={IconToRender}
      iconClassName={cn('text-accent-token', iconClassName)}
      headerRight={headerRight}
      headerClassName='gap-2'
      labelClassName='text-app text-secondary-token tracking-[-0.01em]'
      valueClassName='text-3xl font-semibold tracking-[-0.022em]'
      subtitleClassName='text-app text-tertiary-token'
      aria-label={ariaLabel ?? `${title} metric`}
    />
  );
}
