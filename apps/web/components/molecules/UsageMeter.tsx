// @coverage-via apps/web/tests/unit/components/UsageMeter.test.tsx
import type { UsageMeterModel, UsageMeterState } from '@/lib/usage/model';
import { cn } from '@/lib/utils';

interface UsageMeterProps {
  readonly label: string;
  readonly description?: string;
  readonly model: UsageMeterModel;
  readonly resetLabel: string;
  readonly density?: 'compact' | 'comfortable';
  readonly className?: string;
}

const STATE_LABELS: Record<UsageMeterState, string> = {
  healthy: 'On pace',
  warning: 'Near limit',
  exhausted: 'Limit reached',
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function UsageMeter({
  label,
  description,
  model,
  resetLabel,
  density = 'comfortable',
  className,
}: UsageMeterProps) {
  const compact = density === 'compact';

  return (
    <div
      className={cn(
        compact ? 'space-y-2 px-2.5 py-2' : 'space-y-3 px-4 py-4 sm:px-5',
        className
      )}
      data-state={model.state}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <p className='text-xs font-caption text-primary-token'>{label}</p>
          {description ? (
            <p className='mt-0.5 text-2xs leading-[15px] text-secondary-token'>
              {description}
            </p>
          ) : null}
        </div>
        <p className='shrink-0 text-right text-xs font-caption tabular-nums text-primary-token'>
          {model.remainingPercent}% left
        </p>
      </div>

      <div
        role='progressbar'
        aria-label={`${label} remaining`}
        aria-valuemin={0}
        aria-valuemax={model.limit}
        aria-valuenow={model.remaining}
        aria-valuetext={`${formatNumber(model.remaining)} of ${formatNumber(model.limit)} remaining. ${STATE_LABELS[model.state]}.`}
        className={cn(
          'relative h-2 rounded-full',
          model.state === 'exhausted' ? 'bg-error/20' : 'bg-surface-2'
        )}
      >
        <div
          data-testid='usage-meter-fill'
          className={cn(
            'h-full rounded-full transition-[width] duration-subtle ease-out motion-reduce:transition-none',
            model.state === 'exhausted'
              ? 'bg-error'
              : model.state === 'warning'
                ? 'bg-warning'
                : 'bg-accent'
          )}
          style={{ width: `${model.remainingPercent}%` }}
        />
        <span
          aria-hidden
          title={`${model.warningRemainingPercent}% warning threshold`}
          data-threshold='warning'
          className='absolute top-1/2 h-3 w-px -translate-y-1/2 rounded-full bg-warning ring-1 ring-surface-1'
          style={{ left: `${model.warningRemainingPercent}%` }}
        />
      </div>

      <div className='flex items-start justify-between gap-3 text-2xs leading-[15px] text-secondary-token'>
        <p
          className={cn(
            model.state === 'warning' && 'text-warning',
            model.state === 'exhausted' && 'text-error'
          )}
        >
          <span className='font-caption text-primary-token'>
            {formatNumber(model.remaining)} left
          </span>
          <span
            className={cn(
              model.state === 'healthy' && 'text-tertiary-token',
              model.state === 'warning' && 'text-warning',
              model.state === 'exhausted' && 'text-error'
            )}
          >
            {' '}
            · {STATE_LABELS[model.state]}
          </span>
        </p>
        <p className='shrink-0 text-right text-tertiary-token'>{resetLabel}</p>
      </div>
    </div>
  );
}
