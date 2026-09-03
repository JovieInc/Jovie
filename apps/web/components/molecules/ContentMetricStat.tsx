import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ContentMetricStatProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly subtitle?: ReactNode;
  readonly className?: string;
  readonly labelClassName?: string;
  readonly valueClassName?: string;
  readonly subtitleClassName?: string;
}

export interface ContentMetricStatSkeletonProps {
  readonly className?: string;
  readonly labelWidthClassName?: string;
  readonly valueWidthClassName?: string;
}

export function ContentMetricStat({
  label,
  value,
  subtitle,
  className,
  labelClassName,
  valueClassName,
  subtitleClassName,
}: Readonly<ContentMetricStatProps>) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <p
        className={cn(
          'truncate text-2xs font-caption tracking-tight text-tertiary-token',
          labelClassName
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'text-3xl font-semibold leading-none tracking-tight text-primary-token tabular-nums',
          valueClassName
        )}
      >
        {value}
      </p>
      {subtitle ? (
        <p
          className={cn(
            'text-xs leading-[17px] text-secondary-token',
            subtitleClassName
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function ContentMetricStatSkeleton({
  className,
  labelWidthClassName = 'w-20',
  valueWidthClassName = 'w-16',
}: Readonly<ContentMetricStatSkeletonProps>) {
  return (
    <div className={cn('min-w-0 space-y-2', className)} aria-hidden='true'>
      <div className={cn('h-3 rounded skeleton', labelWidthClassName)} />
      <div className={cn('h-8 rounded skeleton', valueWidthClassName)} />
    </div>
  );
}
