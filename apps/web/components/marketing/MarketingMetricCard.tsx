import { cn } from '@/lib/utils';

export interface MarketingMetricCardProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: string;
  readonly valueAside?: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly className?: string;
  readonly testId?: string;
  readonly valueClassName?: string;
  readonly valueAsideClassName?: string;
}

export function MarketingMetricCard({
  icon,
  label,
  value,
  valueAside,
  description,
  className,
  testId,
  valueClassName,
  valueAsideClassName,
}: Readonly<MarketingMetricCardProps>) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'homepage-surface-card rounded-[1rem] px-4 py-3.5',
        className
      )}
    >
      <div className='flex items-center gap-2 text-[12px] font-medium text-secondary-token'>
        {icon}
        {label}
      </div>
      <div className='mt-2 flex items-end justify-between gap-4'>
        <p
          className={cn(
            'text-[1.45rem] font-medium tracking-[-0.04em] text-primary-token',
            valueClassName
          )}
        >
          {value}
        </p>
        {valueAside ? (
          <div
            className={cn(
              'pb-1 text-[12px] text-tertiary-token',
              valueAsideClassName
            )}
          >
            {valueAside}
          </div>
        ) : null}
      </div>
      {description ? (
        <div className='mt-1 text-[12px] leading-5 text-tertiary-token'>
          {description}
        </div>
      ) : null}
    </div>
  );
}
