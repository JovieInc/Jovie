'use client';

import { cn } from '../lib/utils';
import { Skeleton } from './skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

export type CinematicMetricDensity = 'glance' | 'summary' | 'dense';

export interface CinematicMetricProps {
  readonly label: string;
  /** Null means unmeasured; zero remains a measured value. */
  readonly value: string | number | null;
  readonly detail?: string | null;
  readonly density?: CinematicMetricDensity;
  readonly loading?: boolean;
  readonly className?: string;
}

const DENSITY = {
  glance: { frame: 'h-28', value: 'h-9 text-3xl' },
  summary: { frame: 'h-24', value: 'h-7 text-xl' },
  dense: { frame: 'h-20', value: 'h-6 text-lg' },
} satisfies Record<CinematicMetricDensity, { frame: string; value: string }>;

/** One reserved label/value/context frame across every async state. */
export function CinematicMetric({
  label,
  value,
  detail,
  density = 'summary',
  loading = false,
  className,
}: CinematicMetricProps) {
  const geometry = DENSITY[density];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <dl
            tabIndex={0}
            className={cn(
              'flex min-w-0 flex-col justify-between gap-1 rounded-md py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              geometry.frame,
              className
            )}
            aria-busy={loading}
            data-slot='cinematic-metric'
            data-density={density}
          >
            <dt className='h-4 truncate text-xs leading-4 text-secondary-token'>
              {label}
            </dt>
            <dd
              className={cn(
                'm-0 min-w-0 font-semibold tabular-nums tracking-tight text-primary-token',
                geometry.value
              )}
            >
              {loading ? (
                <>
                  <Skeleton className='h-full w-2/3' />
                  <span className='sr-only' role='status'>
                    Loading {label}
                  </span>
                </>
              ) : (
                <span
                  className={cn(
                    'block truncate leading-none',
                    value === null &&
                      'text-sm font-normal leading-6 text-secondary-token'
                  )}
                >
                  {value ?? 'Not measured'}
                </span>
              )}
            </dd>
            <dd className='m-0 h-4 truncate text-xs leading-4 text-secondary-token'>
              {loading ? (
                <Skeleton className='h-4 w-1/2' />
              ) : (
                (detail ?? <span aria-hidden='true'>&nbsp;</span>)
              )}
            </dd>
          </dl>
        </TooltipTrigger>
        <TooltipContent>
          {label}: {loading ? 'Loading' : (value ?? 'Not measured')}
          {!loading && detail ? ` · ${detail}` : ''}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function CinematicMetricSkeleton({
  label,
  density,
  className,
}: Pick<CinematicMetricProps, 'label' | 'density' | 'className'>) {
  return (
    <CinematicMetric
      label={label}
      value={null}
      density={density}
      className={className}
      loading
    />
  );
}
