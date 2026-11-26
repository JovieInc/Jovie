import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import {
  DELTA_TEXT_CLASS,
  type DeltaDirection,
  deltaSentiment,
  type MetricPolarity,
} from '@/lib/design/metric-tone';
import { cn } from '@/lib/utils';

export type ContentMetricDeltaDirection = DeltaDirection;

export interface ContentMetricDeltaProps {
  readonly value: string;
  readonly direction: ContentMetricDeltaDirection;
  /** Whether a rise is good news. Color follows sentiment, not direction. */
  readonly polarity: MetricPolarity;
  readonly className?: string;
  readonly iconClassName?: string;
  readonly 'aria-label'?: string;
  readonly 'data-testid'?: string;
}

const DIRECTION_ICON = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
} as const;

export function ContentMetricDelta({
  value,
  direction,
  polarity,
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
        DELTA_TEXT_CLASS[deltaSentiment(direction, polarity)],
        className
      )}
      data-testid={testId}
    >
      <Icon className={cn('h-4 w-4 shrink-0', iconClassName)} aria-hidden />
      {ariaLabel ? <span className='sr-only'>{ariaLabel}</span> : null}
      <span aria-hidden={ariaLabel ? true : undefined}>{value}</span>
    </div>
  );
}
