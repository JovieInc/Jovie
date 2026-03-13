import type { ElementType, ReactNode } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { cn } from '@/lib/utils';

export interface ContentMetricCardProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly subtitle?: ReactNode;
  readonly icon?: React.ComponentType<{ className?: string }>;
  readonly iconClassName?: string;
  readonly as?: ElementType;
  readonly className?: string;
  readonly bodyClassName?: string;
  readonly labelClassName?: string;
  readonly valueClassName?: string;
  readonly subtitleClassName?: string;
}

export function ContentMetricCard({
  label,
  value,
  subtitle,
  icon: Icon,
  iconClassName,
  as,
  className,
  bodyClassName,
  labelClassName,
  valueClassName,
  subtitleClassName,
}: Readonly<ContentMetricCardProps>) {
  return (
    <ContentSurfaceCard as={as} className={cn('p-4', className)}>
      <div className={cn('space-y-1.5', bodyClassName)}>
        <div className='flex items-center gap-1.5'>
          {Icon ? (
            <Icon
              className={cn(
                'size-3.5 shrink-0 text-(--linear-text-tertiary)',
                iconClassName
              )}
            />
          ) : null}
          <p
            className={cn(
              'text-[11px] font-[510] tracking-[0.04em] text-(--linear-text-tertiary)',
              labelClassName
            )}
          >
            {label}
          </p>
        </div>
        <p
          className={cn(
            'text-[28px] font-[620] leading-none tracking-[-0.03em] text-(--linear-text-primary) tabular-nums',
            valueClassName
          )}
        >
          {value}
        </p>
        {subtitle ? (
          <div
            className={cn(
              'text-[12px] leading-[17px] text-(--linear-text-secondary)',
              subtitleClassName
            )}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </ContentSurfaceCard>
  );
}
