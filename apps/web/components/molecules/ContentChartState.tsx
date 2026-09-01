import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const CHART_SKELETON_LINE_KEYS = ['primary', 'secondary', 'tertiary'] as const;

export interface ContentChartFrameProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly heightClassName?: string;
  readonly testId?: string;
}

export interface ContentChartSkeletonProps {
  readonly className?: string;
  readonly heightClassName?: string;
  readonly label?: string;
  readonly testId?: string;
}

export interface ContentChartStateProps {
  readonly state: 'empty' | 'error';
  readonly message: ReactNode;
  readonly title?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
  readonly heightClassName?: string;
  readonly testId?: string;
}

export function ContentChartFrame({
  children,
  className,
  heightClassName = 'h-64',
  testId,
}: Readonly<ContentChartFrameProps>) {
  return (
    <div
      className={cn(
        'flex w-full items-center rounded-lg bg-surface-0 p-4',
        heightClassName,
        className
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function ContentChartSkeleton({
  className,
  heightClassName = 'h-64',
  label = 'Loading Chart',
  testId,
}: Readonly<ContentChartSkeletonProps>) {
  return (
    <div
      className={cn(
        'w-full rounded-lg bg-surface-0',
        heightClassName,
        className
      )}
      role='status'
      aria-busy='true'
      aria-live='polite'
      data-testid={testId}
    >
      <span className='sr-only'>{label}</span>
      <svg
        aria-hidden='true'
        className='h-full w-full text-tertiary-token'
        width='100%'
        height='100%'
        viewBox='0 0 400 200'
        preserveAspectRatio='none'
      >
        {CHART_SKELETON_LINE_KEYS.map((key, index) => {
          const yOffset = 60 + index * 40;
          const amplitude = 15 - index * 4;
          const path =
            `M0,${yOffset} Q50,${yOffset - amplitude} 100,${yOffset} T200,${yOffset} T300,${yOffset} T400,${yOffset}`;

          return (
            <path
              key={key}
              d={path}
              stroke='currentColor'
              strokeWidth='1.5'
              fill='none'
              opacity={0.18 - index * 0.04}
            />
          );
        })}
      </svg>
    </div>
  );
}

export function ContentChartState({
  state,
  message,
  title,
  action,
  className,
  heightClassName = 'h-64',
  testId,
}: Readonly<ContentChartStateProps>) {
  return (
    <ContentChartFrame
      className={className}
      heightClassName={heightClassName}
      testId={testId}
    >
      <div
        className='w-full max-w-sm space-y-1'
        data-state={state}
        role={state === 'error' ? 'alert' : 'status'}
      >
        {title ? (
          <p className='text-2xs font-medium tracking-normal text-secondary-token'>
            {title}
          </p>
        ) : null}
        <p className='text-app leading-5 text-secondary-token'>{message}</p>
        {action ? <div className='pt-2'>{action}</div> : null}
      </div>
    </ContentChartFrame>
  );
}
