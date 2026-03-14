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
        'flex items-center justify-between gap-3 rounded-[10px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-3 py-2.5',
        className
      )}
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-2 text-[13px] font-[510] text-(--linear-text-primary)',
          labelClassName
        )}
      >
        {Icon ? (
          <Icon
            className={cn(
              'size-4 shrink-0 text-(--linear-text-tertiary)',
              iconClassName
            )}
          />
        ) : null}
        <span className='truncate'>{label}</span>
      </div>
      <span
        className={cn(
          'shrink-0 text-[13px] font-[590] text-(--linear-text-primary) tabular-nums',
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  );
}
