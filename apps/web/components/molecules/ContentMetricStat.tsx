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
          'truncate text-[11px] font-[510] tracking-[0.04em] text-(--linear-text-tertiary)',
          labelClassName
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'text-[28px] font-[620] leading-none tracking-[-0.03em] text-(--linear-text-primary) tabular-nums',
          valueClassName
        )}
      >
        {value}
      </p>
      {subtitle ? (
        <p
          className={cn(
            'text-[12px] leading-[17px] text-(--linear-text-secondary)',
            subtitleClassName
          )}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
