import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { cn } from '@/lib/utils';

export interface ContentMetricCardProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly subtitle?: ReactNode;
  readonly icon?: React.ComponentType<{ className?: string }>;
  readonly iconClassName?: string;
  readonly headerRight?: ReactNode;
  readonly as?: ElementType;
  readonly className?: string;
  readonly bodyClassName?: string;
  readonly headerClassName?: string;
  readonly labelClassName?: string;
  readonly valueClassName?: string;
  readonly subtitleClassName?: string;
  readonly id?: string;
  readonly role?: string;
  readonly 'aria-label'?: ComponentPropsWithoutRef<'section'>['aria-label'];
  readonly 'data-testid'?: string;
}

export function ContentMetricCard({
  label,
  value,
  subtitle,
  icon: Icon,
  iconClassName,
  headerRight,
  as,
  className,
  bodyClassName,
  headerClassName,
  labelClassName,
  valueClassName,
  subtitleClassName,
  ...props
}: Readonly<ContentMetricCardProps>) {
  return (
    <ContentSurfaceCard as={as} className={cn('p-3.5', className)} {...props}>
      <div className={cn('space-y-1', bodyClassName)}>
        <div className={cn('flex items-center gap-1.5', headerClassName)}>
          <div className='min-w-0 flex items-center gap-1.5'>
            {Icon ? (
              <Icon
                className={cn(
                  'size-3.5 shrink-0 text-tertiary-token',
                  iconClassName
                )}
              />
            ) : null}
            <p
              className={cn(
                'truncate text-[11px] font-semibold tracking-normal text-tertiary-token',
                labelClassName
              )}
            >
              {label}
            </p>
          </div>
          {headerRight ? (
            <div className='ml-auto shrink-0'>{headerRight}</div>
          ) : null}
        </div>
        <p
          className={cn(
            'text-[26px] font-semibold leading-none tracking-[-0.03em] text-primary-token tabular-nums',
            valueClassName
          )}
        >
          {value}
        </p>
        {subtitle ? (
          <div
            className={cn(
              'text-[12px] leading-[16px] text-secondary-token',
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
