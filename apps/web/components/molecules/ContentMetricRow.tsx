import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ContentMetricRowProps {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly icon?: React.ComponentType<{ className?: string }>;
  readonly iconClassName?: string;
  readonly className?: string;
  readonly labelClassName?: string;
  readonly valueClassName?: string;
}

export function ContentMetricRow({
  label,
  value,
  icon: Icon,
  iconClassName,
  className,
  labelClassName,
  valueClassName,
}: Readonly<ContentMetricRowProps>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg bg-surface-0 px-2.5 py-2',
        className
      )}
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-2 text-[13px] font-[510] text-primary-token',
          labelClassName
        )}
      >
        {Icon ? (
          <Icon
            className={cn('size-4 shrink-0 text-tertiary-token', iconClassName)}
          />
        ) : null}
        <span className='truncate'>{label}</span>
      </div>
      <span
        className={cn(
          'shrink-0 text-[13px] font-[590] text-primary-token tabular-nums',
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}
