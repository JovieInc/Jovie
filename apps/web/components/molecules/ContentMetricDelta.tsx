import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ContentMetricDeltaDirection = 'up' | 'down' | 'flat';

export interface ContentMetricDeltaProps {
  readonly value: string;
  readonly direction: ContentMetricDeltaDirection;
  readonly className?: string;
  readonly iconClassName?: string;
  readonly 'aria-label'?: string;
  readonly 'data-testid'?: string;
}

const DIRECTION_CLASSNAME: Record<ContentMetricDeltaDirection, string> = {
  up: 'text-success',
  down: 'text-error',
  flat: 'text-tertiary-token',
};

const DIRECTION_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
} as const;

export function ContentMetricDelta({
  value,
  direction,
  className,
  iconClassName,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: Readonly<ContentMetricDeltaProps>) {
  const Icon = DIRECTION_ICON[direction];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 text-app font-medium tabular-nums',
        DIRECTION_CLASSNAME[direction],
        className
      )}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <Icon className={cn('h-4 w-4 shrink-0', iconClassName)} aria-hidden />
      <span>{value}</span>
    </div>
  );
}
